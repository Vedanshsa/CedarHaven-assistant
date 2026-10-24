"""SQLite-first persistence with optional PostgreSQL for accounts and chat history."""
from __future__ import annotations

import os
import secrets
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # SQLite keeps local development usable without PostgreSQL packages.
    psycopg = None
    dict_row = None


@contextmanager
def connection():
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if dsn.startswith("postgresql://") or dsn.startswith("postgres://"):
        if psycopg is None:
            raise RuntimeError("Install psycopg[binary] to use PostgreSQL")
        with psycopg.connect(dsn, row_factory=dict_row) as conn:
            yield conn
        return
    import sqlite3
    if dsn.startswith("sqlite:///"):
        # sqlite:///./relative.db keeps a relative path; sqlite:////abs/path.db
        # keeps the leading slash for an absolute path.
        path = dsn.removeprefix("sqlite:///")
    elif dsn.startswith("sqlite://"):
        path = dsn.removeprefix("sqlite://")
    elif dsn:
        raise RuntimeError("DATABASE_URL must use sqlite:// or postgresql://")
    else:
        path = os.getenv("DATABASE_PATH", "./cedarhaven.db")
    db_path = Path(path).expanduser()
    if not db_path.is_absolute():
        # API and LiveKit worker may be launched from different directories.
        # Resolve relative SQLite paths beside this module so both use one DB.
        db_path = Path(__file__).resolve().parent / db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with connection() as conn:
        if psycopg is None or not (os.getenv("DATABASE_URL", "").startswith(("postgresql://", "postgres://"))):
            conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT 'New chat', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, sources TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE, filename TEXT NOT NULL, storage_path TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE INDEX IF NOT EXISTS messages_chat_created ON messages(chat_id, created_at);
            """)
            upload_columns = {row[1] for row in conn.execute("PRAGMA table_info(uploads)")}
            if "chat_id" not in upload_columns:
                conn.execute("ALTER TABLE uploads ADD COLUMN chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE")
            # Existing account-wide PDFs belong to the user's most recent chat after migration.
            conn.execute("""
                UPDATE uploads
                SET chat_id = (
                    SELECT chats.id FROM chats
                    WHERE chats.user_id = uploads.user_id
                    ORDER BY chats.updated_at DESC, chats.created_at DESC LIMIT 1
                )
                WHERE chat_id IS NULL
                  AND EXISTS (SELECT 1 FROM chats WHERE chats.user_id = uploads.user_id)
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS uploads_chat_created ON uploads(chat_id, created_at)")
            return
        conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
          email TEXT NOT NULL UNIQUE,
          phone TEXT,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL
        )
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS chats (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL DEFAULT 'New chat', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS messages (
          id BIGSERIAL PRIMARY KEY, chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
          sources JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS uploads (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
          filename TEXT NOT NULL, storage_path TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """)
        conn.execute("ALTER TABLE uploads ADD COLUMN IF NOT EXISTS chat_id UUID REFERENCES chats(id) ON DELETE CASCADE")
        conn.execute("""
            UPDATE uploads AS u SET chat_id = (
              SELECT c.id FROM chats AS c WHERE c.user_id = u.user_id
              ORDER BY c.updated_at DESC, c.created_at DESC LIMIT 1
            ) WHERE u.chat_id IS NULL
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS messages_chat_created ON messages(chat_id, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS uploads_chat_created ON uploads(chat_id, created_at)")


def create_user(name, email, phone, password_hash):
    with connection() as conn:
        if _sqlite(conn):
            user_id = str(uuid.uuid4())
            conn.execute("INSERT INTO users(id,name,email,phone,password_hash) VALUES(?,?,?,?,?)", (user_id,name,email,phone,password_hash))
            return {"id":user_id,"name":name,"email":email}
        return conn.execute("INSERT INTO users(name,email,phone,password_hash) VALUES(%s,%s,%s,%s) RETURNING id::text AS id,name,email", (name,email,phone,password_hash)).fetchone()


def get_login_user(email):
    with connection() as conn:
        if _sqlite(conn): return conn.execute("SELECT id,name,email,password_hash FROM users WHERE email=?", (email,)).fetchone()
        return conn.execute("SELECT id::text AS id,name,email,password_hash FROM users WHERE email=%s", (email,)).fetchone()


def chat_exists(user_id, chat_id):
    with connection() as conn:
        if _sqlite(conn): return conn.execute("SELECT 1 FROM chats WHERE id=? AND user_id=?",(chat_id,user_id)).fetchone() is not None
        return conn.execute("SELECT 1 FROM chats WHERE id=%s AND user_id=%s",(chat_id,user_id)).fetchone() is not None


def create_session(user_id: str) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=14)
    import hashlib
    digest = hashlib.sha256(token.encode()).hexdigest()
    with connection() as conn:
        if _sqlite(conn):
            conn.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", (digest, user_id, expires.isoformat()))
        else:
            conn.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(%s,%s,%s)", (digest, user_id, expires))
    return token, expires


def get_user(token: str | None):
    if not token:
        return None
    import hashlib
    digest = hashlib.sha256(token.encode()).hexdigest()
    with connection() as conn:
        if _sqlite(conn):
            return conn.execute("SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?", (digest, datetime.now(timezone.utc).isoformat())).fetchone()
        return conn.execute("""SELECT u.id::text AS id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=%s AND s.expires_at > now()""", (digest,)).fetchone()


def delete_session(token: str | None):
    if token:
        import hashlib
        with connection() as conn:
            if _sqlite(conn): conn.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))
            else: conn.execute("DELETE FROM sessions WHERE token_hash=%s", (hashlib.sha256(token.encode()).hexdigest(),))


def create_chat(user_id: str, title: str = "New chat"):
    with connection() as conn:
        if _sqlite(conn):
            import uuid
            chat_id = str(uuid.uuid4())
            conn.execute("INSERT INTO chats(id,user_id,title) VALUES(?,?,?)", (chat_id, user_id, title))
            return {"id": chat_id, "title": title}
        return conn.execute("INSERT INTO chats(user_id,title) VALUES(%s,%s) RETURNING id::text AS id,title", (user_id, title)).fetchone()


def list_chats(user_id: str):
    with connection() as conn:
        if _sqlite(conn): return conn.execute("SELECT id,title,updated_at FROM chats WHERE user_id=? ORDER BY updated_at DESC", (user_id,)).fetchall()
        return conn.execute("SELECT id::text AS id,title,updated_at FROM chats WHERE user_id=%s ORDER BY updated_at DESC", (user_id,)).fetchall()


def chat_messages(user_id: str, chat_id: str):
    with connection() as conn:
        if _sqlite(conn):
            import json
            rows = conn.execute("SELECT id,role,content,sources,created_at FROM messages WHERE user_id=? AND chat_id=? ORDER BY created_at,id", (user_id, chat_id)).fetchall()
            return [{**dict(row), "sources": json.loads(row["sources"])} for row in rows]
        return conn.execute("SELECT id,role,content,sources,created_at FROM messages WHERE user_id=%s AND chat_id=%s ORDER BY created_at,id", (user_id, chat_id)).fetchall()


def save_message(user_id: str, chat_id: str, role: str, content: str, sources=None):
    with connection() as conn:
        if _sqlite(conn):
            import json
            chat = conn.execute("SELECT id FROM chats WHERE id=? AND user_id=?", (chat_id, user_id)).fetchone()
            if not chat: return False
            conn.execute("INSERT INTO messages(chat_id,user_id,role,content,sources) VALUES(?,?,?,?,?)", (chat_id,user_id,role,content,json.dumps(sources or [])))
            if role == "user": conn.execute("UPDATE chats SET title=? WHERE id=? AND user_id=? AND title='New chat'", (content[:60],chat_id,user_id))
            conn.execute("UPDATE chats SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?", (chat_id,user_id))
            return True
        chat = conn.execute("SELECT id FROM chats WHERE id=%s AND user_id=%s FOR UPDATE", (chat_id, user_id)).fetchone()
        if not chat:
            return False
        conn.execute("INSERT INTO messages(chat_id,user_id,role,content,sources) VALUES(%s,%s,%s,%s,%s)", (chat_id, user_id, role, content, psycopg.types.json.Jsonb(sources or [])))
        if role == "user":
            conn.execute("UPDATE chats SET title=%s WHERE id=%s AND user_id=%s AND title='New chat'", (content[:60], chat_id, user_id))
        conn.execute("UPDATE chats SET updated_at=now() WHERE id=%s AND user_id=%s", (chat_id, user_id))
        return True


def add_upload(user_id: str, chat_id: str, filename: str, storage_path: str):
    with connection() as conn:
        if _sqlite(conn):
            upload_id = str(uuid.uuid4())
            owned_chat = conn.execute("SELECT 1 FROM chats WHERE id=? AND user_id=?", (chat_id, user_id)).fetchone()
            if not owned_chat:
                return None
            conn.execute("INSERT INTO uploads(id,user_id,chat_id,filename,storage_path) VALUES(?,?,?,?,?)", (upload_id,user_id,chat_id,filename,storage_path))
            return {"id": upload_id, "filename": filename}
        owned_chat = conn.execute("SELECT 1 FROM chats WHERE id=%s AND user_id=%s", (chat_id, user_id)).fetchone()
        if not owned_chat:
            return None
        return conn.execute("INSERT INTO uploads(user_id,chat_id,filename,storage_path) VALUES(%s,%s,%s,%s) RETURNING id::text AS id,filename", (user_id, chat_id, filename, storage_path)).fetchone()


def user_uploads(user_id: str, chat_id: str):
    with connection() as conn:
        if _sqlite(conn):
            return conn.execute("SELECT id,filename,storage_path FROM uploads WHERE user_id=? AND chat_id=? ORDER BY created_at DESC", (user_id, chat_id)).fetchall()
        return conn.execute("SELECT id::text AS id,filename,storage_path FROM uploads WHERE user_id=%s AND chat_id=%s ORDER BY created_at DESC", (user_id, chat_id)).fetchall()


def delete_upload(user_id: str, chat_id: str, upload_id: str):
    with connection() as conn:
        if _sqlite(conn):
            row = conn.execute("SELECT storage_path FROM uploads WHERE id=? AND user_id=? AND chat_id=?", (upload_id, user_id, chat_id)).fetchone()
            if not row:
                return None
            conn.execute("DELETE FROM uploads WHERE id=? AND user_id=? AND chat_id=?", (upload_id, user_id, chat_id))
            return row["storage_path"]
        row = conn.execute("DELETE FROM uploads WHERE id=%s AND user_id=%s AND chat_id=%s RETURNING storage_path", (upload_id, user_id, chat_id)).fetchone()
        return row["storage_path"] if row else None


def _sqlite(conn):
    return conn.__class__.__module__ == "sqlite3"
