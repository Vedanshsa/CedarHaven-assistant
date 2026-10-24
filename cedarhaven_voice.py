"""Voice / real-time layer for the Cedarhaven assistant (LiveKit).

The voice agent has NO free-running language model. Every utterance goes through the same
verified pipeline as the web chat (`CedarhavenAssistant.answer`), and the agent only ever
speaks text that was assembled from verified claims. The room also receives the full answer
(sources, exact quotes, status) so the UI can show the evidence while the answer is spoken.

What the agent does in a room:
  1. voice question  -> verified answer, spoken + shown
  2. typed question  -> same pipeline (LiveKit text chat)
  3. live evidence   -> every answer is published to the room (text stream, topic TOPIC)
  4. "repeat that"   -> re-speaks the last answer without a new lookup
  5. "where is that from?" -> reads out the last answer's sources, re-sends the evidence
  6. gaps / refusals -> spoken with the guides' own wording, never improvised
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import inspect
from typing import Any, Awaitable, Callable

from livekit.agents import Agent, StopResponse

logger = logging.getLogger("cedarhaven-voice")
TOPIC = "cedarhaven.answer"

GREETING = ("Hello, I'm the Cedarhaven assistant. Ask me about service requests, by-laws, "
            "permits or licences. I only answer from the three town guides.")

_REPEAT_RE = re.compile(r"\b(repeat|say (that|it) again|come again|pardon|say again|one more time)\b", re.I)
_SOURCE_RE = re.compile(
    r"\b(which|what)\s+(document|guide|source|section|page)\b|\bwhere\s+(is|was|did|does)\s+(that|this|it)\b"
    r"|\bwhere\s+(that|this|it)\s+(come|came|from)\b|\bsource\b|\bcite\b|\bcitation\b", re.I)
_CITE_RE = re.compile(r"\s*\[CH-[A-Z]{3}-\d\d · [^\]]+\]")
_SPOKEN_SUBS = [
    (re.compile(r"\bm2\b", re.I), "square metres"), (re.compile(r"\bm²", re.I), " square metres"),
    (re.compile(r"(\d)\s?cm\b"), r"\1 centimetres"), (re.compile(r"(\d)\s?m\b"), r"\1 metres"),
    (re.compile(r"\ba\.m\.", re.I), "AM"), (re.compile(r"\bp\.m\.", re.I), "PM"),
    (re.compile(r"\bCAD\b"), "Canadian dollars"), (re.compile(r"\b311\b"), "three one one"),
    (re.compile(r"(\d|AM|PM)-(\d)"), r"\1 to \2"), (re.compile(r"\bP([1-4])\b"), r"priority \1"),
    (re.compile(r"\bBYL\b"), "by-law section"), (re.compile(r"\bPER\b"), "permit section"),
    (re.compile(r"\bSRM\b"), "service request section"),
]


def speakable(text: str) -> str:
    """Strip citation brackets and make units / times readable by a TTS voice."""
    t = _CITE_RE.sub("", text)
    t = t.replace("\n\n", " ").replace("\n", " ")
    for pat, rep in _SPOKEN_SUBS:
        t = pat.sub(rep, t)
    return re.sub(r"\s+", " ", t).strip()


def sources_sentence(sources: list[dict]) -> str:
    seen, parts = set(), []
    for s in sources:
        key = (s["doc_title"], s["page"])
        if key in seen:
            continue
        seen.add(key)
        parts.append(f"the {s['doc_title']} guide, page {s['page']}, {s['heading']}")
    if not parts:
        return ""
    return "That comes from " + (parts[0] if len(parts) == 1 else ", and ".join(parts)) + "."


def to_spoken(resp: dict) -> str:
    """What the agent says for a pipeline response."""
    status = resp.get("status")
    if status == "extractive":
        return ("I can't reach my language model right now, so I can only show the closest passages "
                "from the guides on screen.")
    body = speakable(resp.get("answer", ""))
    if status in {"answered", "gap"}:
        src = sources_sentence([s for s in resp.get("sources", []) if s.get("kind") == "fact"] or resp.get("sources", []))
        if body and body[-1] not in ".!?":
            body += "."
        return f"{body} {src}".strip()
    return body


def to_payload(question: str, resp: dict) -> dict:
    """Compact JSON for the UI evidence panel (kept well under data-packet limits)."""
    dbg = resp.get("debug") or {}
    return {
        "question": question,
        "status": resp.get("status"),
        "answer": resp.get("answer", ""),
        "sources": [{k: s.get(k) for k in ("id", "doc_id", "doc_title", "page", "section", "heading",
                                           "citation", "kind", "quotes")} for s in resp.get("sources", [])],
        "checks": {
            "retrieved": [{k: r.get(k) for k in ("id", "citation", "heading", "used")} for r in dbg.get("retrieved", [])],
            "rejected": len(dbg.get("rejected_claims", [])),
            "repaired": bool(dbg.get("repaired")),
            "latency_ms": dbg.get("latency_ms"),
            "model": dbg.get("model"),
            "reason": dbg.get("reason"),
        },
    }


class CedarhavenVoiceAgent(Agent):
    """LiveKit agent whose replies come only from the verified Cedarhaven pipeline."""

    def __init__(
        self,
        bot,
        publish: Callable[[dict], Awaitable[None]],
        speak: Callable[[str], Any] | None = None,
        user_id: str | None = None,
        chat_id: str | None = None,
    ):
        super().__init__(instructions="Cedarhaven municipal information assistant (no free generation).")
        self.bot = bot
        self._publish = publish
        self._speak_override = speak
        self.user_id = user_id
        self.chat_id = chat_id
        self.last_payload: dict | None = None
        self.last_spoken: str = ""

    # -- helpers ------------------------------------------------------------ #
    async def _say(self, text: str) -> None:
        self.last_spoken = text
        if self._speak_override:
            result = self._speak_override(text)
            if inspect.isawaitable(result):
                await result
        else:
            speech = self.session.say(text, allow_interruptions=True)
            await speech.wait_for_playout()
            if speech.exception():
                raise speech.exception()

    async def _safe_publish(self, payload: dict) -> None:
        try:
            await self._publish(payload)
        except Exception as exc:  # the UI panel is a bonus; never block the spoken answer
            print("[cedarhaven] publish failed:", type(exc).__name__, exc, flush=True)

    # -- the whole behaviour ------------------------------------------------ #
    async def handle_utterance(self, text: str) -> None:
        text = (text or "").strip()
        if not text:
            return
        context = []
        if self.user_id and self.chat_id:
            from account_store import chat_messages, save_message
            context = chat_messages(self.user_id, self.chat_id)[-8:]
            if not save_message(self.user_id, self.chat_id, "user", text):
                await self._say("This chat is no longer available. Please start a new chat.")
                return
        if _REPEAT_RE.search(text) and len(text.split()) <= 6:
            response = self.last_spoken or "I haven't said anything yet. Ask me a question about your documents."
            await self._say(response)
            self._save_assistant(response)
            return
        if _SOURCE_RE.search(text) and len(text.split()) <= 9 and self.last_payload:
            srcs = self.last_payload["sources"]
            if srcs:
                await self._safe_publish(self.last_payload)
                response = sources_sentence(srcs)
                await self._say(response)
                self._save_assistant(response, self.last_payload.get("sources", []))
                return
            response = "My last answer didn't rest on a document passage."
            await self._say(response)
            self._save_assistant(response)
            return

        try:
            if self.user_id:
                from account_store import user_uploads
                docs = [{"path": row["storage_path"], "filename": row["filename"]}
                        for row in user_uploads(self.user_id)]
                resp = await asyncio.to_thread(self.bot.answer_with_documents, text, docs, context)
            else:
                resp = await asyncio.to_thread(self.bot.answer, text)
        except Exception as exc:
            print("[cedarhaven] answer() failed:", type(exc).__name__, exc, flush=True)
            error_reply = "Sorry, something went wrong while checking your documents. Please ask again."
            await self._say(error_reply)
            self._save_assistant(error_reply)
            return
        payload = to_payload(text, resp)
        self.last_payload = payload
        await self._safe_publish(payload)  # evidence appears on screen as the voice starts
        spoken = to_spoken(resp)
        logger.info("Verified response ready; starting speech playback (status=%s)", resp.get("status"))
        await self._say(spoken)
        self._save_assistant(resp.get("answer", spoken), resp.get("sources", []), resp.get("status"))

    def _save_assistant(self, text: str, sources: list[dict] | None = None, status: str | None = None) -> None:
        if not self.user_id or not self.chat_id:
            return
        from account_store import save_message
        saved_sources = [{**source, "status": status} for source in (sources or [])]
        try:
            save_message(self.user_id, self.chat_id, "assistant", text, saved_sources)
        except Exception:
            logger.exception("Could not persist assistant voice response")

    async def on_user_turn_completed(self, turn_ctx, new_message) -> None:
        text = new_message.text_content or ""
        if not text.strip():
            logger.warning("Voice turn completed without a recognized transcript")
            raise StopResponse()
        logger.info("Recognized voice turn (%s characters)", len(text))
        try:
            await self.handle_utterance(text)
        except Exception:
            logger.exception("Voice response failed before speech completed")
            error_reply = "Sorry, I couldn't complete that voice response. Please try again."
            self._save_assistant(error_reply)
            try:
                await self._say(error_reply)
            except Exception:
                logger.exception("Could not play the voice error response")
        raise StopResponse()  # never let a free-running LLM add its own words
