"""Voice-layer behaviour with a fake pipeline (runs only if livekit-agents is installed)."""
import asyncio

import pytest

pytest.importorskip("livekit.agents")
from cedarhaven_voice import CedarhavenVoiceAgent, speakable, sources_sentence, to_spoken  # noqa: E402


class FakeBot:
    def __init__(self, resp):
        self.resp, self.calls = resp, []

    def answer(self, q):
        self.calls.append(q)
        return self.resp


ANSWERED = {
    "status": "answered",
    "answer": "Saturday construction noise is only permitted from 9:00 a.m.-5:00 p.m. [CH-BYL-02 · p.2 · BYL 1.2]",
    "sources": [{"id": "S1", "doc_id": "CH-BYL-02", "doc_title": "By-law Enforcement", "page": 2, "section": "BYL 1.2",
                 "heading": "Construction equipment hours", "citation": "CH-BYL-02 · p.2 · BYL 1.2", "kind": "fact",
                 "quotes": ["Saturday 9:00 a.m.-5:00 p.m."]}],
    "debug": {"retrieved": [{"id": "S1", "citation": "CH-BYL-02 · p.2 · BYL 1.2", "heading": "x", "used": True}],
              "rejected_claims": [], "latency_ms": 5},
}


def make(resp=ANSWERED):
    said, sent = [], []

    async def publish(p):
        sent.append(p)

    agent = CedarhavenVoiceAgent(FakeBot(resp), publish, speak=said.append)
    return agent, said, sent


def test_speakable_strips_citations_and_reads_units():
    t = speakable("Open 9:00 a.m.-5:00 p.m., shed up to 12.0 m2 and 3.0 m high. [CH-PER-03 · p.2 · PER 1.1]")
    assert "[" not in t and "AM" in t and "PM" in t and "square metres" in t and "3.0 metres" in t


def test_question_is_answered_published_and_spoken():
    agent, said, sent = make()
    asyncio.run(agent.handle_utterance("Can I use a power saw on Saturday?"))
    assert sent[0]["status"] == "answered" and sent[0]["sources"][0]["quotes"]
    assert "9:00 AM to 5:00 PM" in said[0] and "By-law Enforcement guide, page 2" in said[0]
    assert "CH-BYL" not in said[0]


def test_repeat_does_not_query_again():
    agent, said, _ = make()
    asyncio.run(agent.handle_utterance("Can I use a power saw on Saturday?"))
    asyncio.run(agent.handle_utterance("say that again"))
    assert agent.bot.calls == ["Can I use a power saw on Saturday?"] and said[1] == said[0]


def test_where_is_that_from_reads_sources_and_republishes():
    agent, said, sent = make()
    asyncio.run(agent.handle_utterance("Can I use a power saw on Saturday?"))
    asyncio.run(agent.handle_utterance("where is that from?"))
    assert len(agent.bot.calls) == 1 and len(sent) == 2 and said[1].startswith("That comes from the By-law")


def test_source_question_before_any_answer_goes_through_pipeline():
    agent, said, _ = make()
    asyncio.run(agent.handle_utterance("what is the source of noise rules"))
    assert agent.bot.calls  # no previous answer, so it is treated as a normal question


def test_pipeline_failure_is_spoken_not_raised():
    class Boom:
        def answer(self, q):
            raise RuntimeError("x")
    said = []
    agent = CedarhavenVoiceAgent(Boom(), lambda p: asyncio.sleep(0), speak=said.append)
    asyncio.run(agent.handle_utterance("pothole assessment time"))
    assert "something went wrong" in said[0]


def test_extractive_and_refusal_speech():
    assert "can't reach my language model" in to_spoken({"status": "extractive", "answer": "raw passages"})
    assert to_spoken({"status": "out_of_scope", "answer": "Sorry, this is currently out of my knowledge."}).startswith("Sorry")
    assert sources_sentence([]) == ""


def test_assistant_transcript_is_saved(monkeypatch):
    saved = []
    monkeypatch.setattr(
        "account_store.save_message",
        lambda user_id, chat_id, role, content, sources=None: saved.append(
            (user_id, chat_id, role, content, sources)
        ) or True,
    )
    agent = CedarhavenVoiceAgent(
        FakeBot(ANSWERED),
        lambda payload: asyncio.sleep(0),
        user_id="user-1",
        chat_id="chat-1",
    )

    agent.persist_assistant_transcript("Hello, ask me a question.")

    assert saved == [("user-1", "chat-1", "assistant", "Hello, ask me a question.", [])]


def test_end_call_command_saves_turn_and_sends_disconnect_control(monkeypatch):
    saved = []
    monkeypatch.setattr("account_store.chat_messages", lambda user_id, chat_id: [])
    monkeypatch.setattr(
        "account_store.save_message",
        lambda user_id, chat_id, role, content, sources=None: saved.append(
            (role, content)
        ) or True,
    )
    agent, said, sent = make()
    agent.user_id = "user-1"
    agent.chat_id = "chat-1"

    asyncio.run(agent.handle_utterance("end call"))

    assert saved == [("user", "end call"), ("assistant", "Ending the call now.")]
    assert said == ["Ending the call now."]
    assert sent == [{"action": "end_call"}]
