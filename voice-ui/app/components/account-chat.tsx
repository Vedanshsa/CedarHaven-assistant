"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { LogOut, Paperclip, Plus, Send, Upload, UserRound, MessagesSquare, Mic } from "lucide-react";
import type { AnswerPayload } from "@/hooks/useCedarhavenAnswers";
import { EvidenceView } from "@/components/cedarhaven/evidence-panel";

type User = { id: string; name: string; email: string };
type Chat = { id: string; title: string };
type Message = { role: "user" | "assistant"; content: string; sources?: (AnswerPayload["sources"][number] & { status?: AnswerPayload["status"] })[] };
type UploadItem = { id: string; filename: string };

export function AccountChat() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [question, setQuestion] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [answer, setAnswer] = useState<AnswerPayload | null>(null);
  const [error, setError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatIdRef = useRef("");
  chatIdRef.current = chatId;

  const loadChats = useCallback(async () => {
    const r = await fetch("/api/chats");
    if (!r.ok) throw new Error(r.status === 401 ? "Your session expired. Please sign in again." : "Could not load your saved chats.");
    const list: Chat[] = await r.json();
    setChats(list);
    if (!chatIdRef.current && list.length) setChatId(list[0].id);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then(async r => {
        if (r.status === 401) return null;
        if (!r.ok) throw new Error("Could not connect to the account service.");
        return (await r.json()).user as User;
      })
      .then(u => { if (active && u) setUser(u); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not check your sign-in status."); })
      .finally(() => { /* Render the account form immediately while session lookup completes. */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoadingHistory(true);
    void loadChats().catch(e => setError(e instanceof Error ? e.message : "Could not load your saved chats."))
      .finally(() => setLoadingHistory(false));
    fetch("/api/uploads").then(async r => r.ok ? await r.json() : []).then(setUploads);
  }, [user, loadChats]);

  useEffect(() => {
    if (!chatId) { setMessages([]); setAnswer(null); return; }
    let active = true;
    fetch(`/api/chats/${encodeURIComponent(chatId)}`)
      .then(async r => r.ok ? await r.json() : [])
      .then((rows: Message[]) => {
        if (!active) return;
        setMessages(rows);
        const latest = [...rows].reverse().find((m) => m.role === "assistant" && m.sources?.length);
        if (latest) setAnswer({ question: rows[Math.max(0, rows.indexOf(latest)-1)]?.content || "", answer: latest.content, status: latest.sources?.[0]?.status || "answered", sources: latest.sources!.map(({status: _status, ...source}) => source), checks: { retrieved: [], rejected: 0, repaired: false } });
        else setAnswer(null);
      })
      .catch(() => { if (active) setError("Could not load this chat's history."); });
    return () => { active = false; };
  }, [chatId]);

  async function authenticate(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      if (mode === "signup" && password !== confirm) throw new Error("Passwords do not match.");
      const r = await fetch(`/api/auth/${mode === "signup" ? "signup" : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "signup" ? { name, email, phone: phone || null, password, confirm_password: confirm } : { email, password }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Could not sign in.");
      setUser(data.user); setPassword(""); setConfirm("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); }
    finally { setBusy(false); }
  }

  async function createChat() {
    const r = await fetch("/api/chats", { method: "POST" });
    if (!r.ok) { setError("Could not create a new chat."); return; }
    const chat = await r.json();
    setChats(current => [chat, ...current]); setChatId(chat.id); setMessages([]); setAnswer(null);
  }

  async function sendQuestion(event?: FormEvent) {
    event?.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setQuestion(""); setBusy(true); setError("");
    setMessages(current => [...current, { role: "user", content: text }]);
    try {
      let activeChat = chatId;
      if (!activeChat) {
        const r = await fetch("/api/chats", { method: "POST" });
        if (!r.ok) throw new Error("Could not create a chat.");
        const c = await r.json(); activeChat = c.id; setChatId(c.id); setChats(current => [c, ...current]);
      }
      const r = await fetch(`/api/chats/${activeChat}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Could not answer that question.");
      const storedSources = (data.sources || []).map((s: AnswerPayload["sources"][number], i: number) => ({ ...s, id: s.id || String(i), status: data.status }));
      setMessages(current => [...current, { role: "assistant", content: data.answer, sources: storedSources }]);
      setAnswer({ question: text, ...data, checks: { retrieved: [], rejected: 0, repaired: false }, sources: (data.sources || []).map((s: AnswerPayload["sources"][number], i: number) => ({ ...s, id: s.id || String(i) })) });
      await loadChats();
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); }
    finally { setBusy(false); }
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setNotice(""); setError("");
    try {
      const form = new FormData(); form.set("file", file);
      const r = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Upload failed.");
      setUploads(current => [data, ...current]); setNotice(`${file.name} is ready. Ask a question about it.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null); setChats([]); setChatId(""); setMessages([]); setUploads([]); setAnswer(null);
  }

  async function startVoice() {
    let selectedChat = chatId;
    if (!selectedChat) {
      const response = await fetch("/api/chats", { method: "POST" });
      if (!response.ok) { setError("Could not create a chat for voice mode."); return; }
      const chat = await response.json();
      selectedChat = chat.id;
      setChatId(chat.id);
      setChats(current => [chat, ...current]);
    }
    window.location.assign(`/voice?chatId=${encodeURIComponent(selectedChat)}`);
  }

  if (!user) return <main className="min-h-screen bg-[#050a12] px-5 py-10 text-slate-100"><section className="mx-auto max-w-md rounded-3xl border border-cyan-900/60 bg-slate-950/90 p-8 shadow-2xl shadow-cyan-950/30"><div className="mb-8 flex items-center gap-3"><div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-cyan-300"><UserRound size={24}/></div><div><h1 className="text-2xl font-bold tracking-wide">Cedarhaven</h1><p className="text-sm text-slate-400">Private document assistant</p></div></div><div className="mb-6 flex rounded-xl bg-slate-900 p-1"><button type="button" className={`flex-1 rounded-lg p-2 ${mode === "login" ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400"}`} onClick={() => {setMode("login");setError("");}}>Sign in</button><button type="button" className={`flex-1 rounded-lg p-2 ${mode === "signup" ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400"}`} onClick={() => {setMode("signup");setError("");}}>Create account</button></div><form onSubmit={authenticate} className="grid gap-4">{mode === "signup" && <><label className="grid gap-1 text-sm text-slate-300">Name<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" autoComplete="name"/></label><label className="grid gap-1 text-sm text-slate-300">Mobile number <span className="text-slate-500">(optional)</span><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" autoComplete="tel"/></label></>}<label className="grid gap-1 text-sm text-slate-300">Gmail address<input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" autoComplete="email"/></label><label className="grid gap-1 text-sm text-slate-300">Password<input required minLength={mode === "signup" ? 12 : 1} maxLength={128} type="password" value={password} onChange={e => setPassword(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" autoComplete={mode === "signup" ? "new-password" : "current-password"}/></label>{mode === "signup" && <label className="grid gap-1 text-sm text-slate-300">Confirm password<input required minLength={12} maxLength={128} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" autoComplete="new-password"/></label>}{error && <p role="alert" className="text-sm text-red-300">{error}</p>}<button disabled={busy} className="mt-2 rounded-xl bg-cyan-300 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">{busy ? "Please waitâ€¦" : mode === "signup" ? "Create account" : "Sign in"}</button></form>{mode === "signup" && <p className="mt-4 text-xs text-slate-500">Use 12 or more characters for a safer password. No email verification is required.</p>}</section></main>;

  return <main className="flex min-h-screen bg-[#050a12] text-slate-100"><aside className="hidden w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950/80 p-4 md:flex"><div className="mb-6 flex items-center gap-3 px-2"><MessagesSquare className="text-cyan-300"/><div className="font-bold">Cedarhaven</div></div><button onClick={createChat} className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-3 text-sm hover:border-cyan-500"><Plus size={16}/>New chat</button><div className="mb-2 px-2 text-xs uppercase tracking-widest text-slate-500">Your history</div><nav className="flex-1 space-y-1 overflow-y-auto">{loadingHistory && <p className="px-3 py-2 text-xs text-slate-500">Loading saved chats…</p>}{!loadingHistory && chats.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">No chats yet. Start a new chat.</p>}{chats.map(c => <button key={c.id} onClick={() => setChatId(c.id)} className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm ${chatId === c.id ? "bg-cyan-950/70 text-cyan-100" : "text-slate-400 hover:bg-slate-900"}`}>{c.title}</button>)}</nav><div className="border-t border-slate-800 pt-4"><div className="truncate px-2 text-sm">{user.name}</div><div className="mb-3 truncate px-2 text-xs text-slate-500">{user.email}</div><button onClick={logout} className="flex items-center gap-2 px-2 text-sm text-slate-400 hover:text-white"><LogOut size={16}/>Sign out</button></div></aside><section className="flex min-h-screen min-w-0 flex-1 flex-col"><header className="flex items-center justify-between border-b border-slate-800 px-4 py-3 md:px-8"><div className="font-semibold">Document assistant</div><div className="flex items-center gap-2"><input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={upload} className="hidden"/><button disabled={busy} onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-500"><Upload size={16}/><span className="hidden sm:inline">Upload PDF</span></button><button onClick={startVoice} className="flex items-center gap-2 rounded-lg border border-cyan-800 px-3 py-2 text-sm text-cyan-200"><Mic size={16}/><span className="hidden sm:inline">Voice</span></button><button className="md:hidden" onClick={logout} title="Sign out"><LogOut size={17}/></button></div></header><div className="border-b border-slate-800 px-4 py-2 text-xs text-slate-500 md:px-8">Your uploaded PDFs are private to your account. Answers cite only passages from the guides and your documents.</div><div className="flex min-h-0 flex-1"><div className="flex min-w-0 flex-1 flex-col"><div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 md:px-8">{messages.length === 0 && <div className="mx-auto mt-20 max-w-xl text-center"><div className="mx-auto mb-5 w-fit rounded-3xl border border-cyan-900 bg-cyan-950/40 p-5 text-cyan-300"><MessagesSquare size={30}/></div><h1 className="text-2xl font-semibold">Ask with evidence</h1><p className="mt-2 text-slate-400">Upload a PDF, then ask a question. Answers use relevant paragraphs and show their source.</p></div>}{messages.map((m,i) => <article key={`${i}-${m.role}`} className={`max-w-3xl rounded-2xl px-4 py-3 ${m.role === "user" ? "ml-auto bg-cyan-950/70" : "border border-slate-800 bg-slate-950/80"}`}><div className="mb-1 text-xs font-medium uppercase tracking-widest text-slate-500">{m.role === "user" ? "You" : "Cedarhaven"}</div><p className="whitespace-pre-wrap leading-7">{m.content}</p>{m.sources?.map(s => <details key={s.id} className="mt-3 rounded-lg border border-slate-800 p-3"><summary className="cursor-pointer text-sm text-cyan-300">{s.citation}</summary>{s.quotes.map((quote,j)=><blockquote key={j} className="mt-2 border-l-2 border-cyan-700 pl-3 text-sm text-slate-400">{quote}</blockquote>)}</details>)}</article>)}{busy && <div className="text-sm text-slate-500">Checking the documentsâ€¦</div>}</div><div className="mx-auto w-full max-w-4xl px-4 pb-3"><div className="mb-2 flex flex-wrap gap-2">{uploads.map(u=><span key={u.id} className="flex items-center gap-1 rounded-full border border-slate-800 px-2 py-1 text-xs text-slate-400"><Paperclip size={12}/>{u.filename}</span>)}</div>{notice && <p className="mb-2 text-sm text-emerald-300">{notice}</p>}{error && <p role="alert" className="mb-2 text-sm text-red-300">{error}</p>}<form onSubmit={sendQuestion} className="flex items-end gap-2 rounded-2xl border border-slate-700 bg-slate-950 p-2 focus-within:border-cyan-700"><textarea value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if(e.key === "Enter" && !e.shiftKey){e.preventDefault();void sendQuestion();} }} placeholder="Ask about your documentsâ€¦ (Shift+Enter for a new line)" rows={1} maxLength={800} className="max-h-40 min-h-11 flex-1 resize-y bg-transparent px-3 py-3 outline-none"/><button type="submit" disabled={busy || !question.trim()} title="Send" className="rounded-xl bg-cyan-300 p-3 text-slate-950 disabled:opacity-40"><Send size={18}/></button></form><div className="mt-2 text-center text-[11px] text-slate-600">Answers are limited to relevant passages; unsupported details are identified as unspecified.</div></div></div>{answer && <aside className="hidden w-[360px] shrink-0 border-l border-slate-800 p-4 xl:block"><EvidenceView latest={answer} count={messages.length}/></aside>}</div></section></main>;
}
