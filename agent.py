"""Authenticated, document-grounded LiveKit voice agent.

Each room binds one verified application user to one owned chat. Deepgram's direct
STT/TTS plugins handle audio; answers still use CedarhavenAssistant's quote verifier.
"""
import json
import logging
import os

from dotenv import load_dotenv

load_dotenv()
load_dotenv(".env.local", override=False)

from livekit.agents import AgentServer, AgentSession, JobContext, JobProcess, cli  # noqa: E402
from livekit.plugins import deepgram, silero  # noqa: E402

import account_store  # noqa: E402
from cedarhaven_answer import CedarhavenAssistant  # noqa: E402
from cedarhaven_voice import CedarhavenVoiceAgent, GREETING, TOPIC  # noqa: E402

logger = logging.getLogger("cedarhaven-voice")
AGENT_NAME = "assistant-b92"


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()
    proc.userdata["bot"] = CedarhavenAssistant()


server = AgentServer(setup_fnc=prewarm, initialize_process_timeout=60.0)


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    # Token room configuration carries the authenticated account/chat metadata.
    try:
        binding = json.loads(ctx.job.metadata)
        user_id = str(binding["user_id"])
        chat_id = str(binding["chat_id"])
    except (AttributeError, KeyError, TypeError, ValueError):
        logger.error("Rejecting LiveKit job with invalid account binding")
        return
    if not account_store.chat_exists(user_id, chat_id):
        logger.error("Rejecting LiveKit room for a chat not owned by its user")
        return
    if not os.getenv("DEEPGRAM_API_KEY"):
        logger.error("DEEPGRAM_API_KEY is missing; configure it in the project-root .env")
        return

    logger.info("Accepted voice job for an owned chat")

    # rtc_session jobs must join the room before reading or publishing media.
    await ctx.connect()

    bot = ctx.proc.userdata["bot"]

    async def publish(payload: dict) -> None:
        await ctx.room.local_participant.send_text(
            json.dumps(payload, ensure_ascii=False), topic=TOPIC
        )

    session = AgentSession(
        stt=deepgram.STT(
            model=os.getenv("DEEPGRAM_STT_MODEL", "nova-3"),
            language=os.getenv("DEEPGRAM_STT_LANGUAGE", "en"),
        ),
        tts=deepgram.TTS(
            model=os.getenv("DEEPGRAM_TTS_MODEL", "aura-2-asteria-en"),
        ),
        vad=ctx.proc.userdata["vad"],
    )

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(event) -> None:
        if event.is_final:
            logger.info("Deepgram returned a final transcript (%s characters)", len(event.transcript))

    @session.on("user_transcription_timeout")
    def on_user_transcription_timeout(event) -> None:
        logger.warning("Speech detected but Deepgram returned no transcript (%.1fs)", event.speech_duration)

    @session.on("error")
    def on_session_error(event) -> None:
        logger.error(
            "Voice provider error (source=%s, error=%s)",
            type(event.source).__name__,
            type(event.error).__name__,
        )

    await session.start(
        agent=CedarhavenVoiceAgent(
            bot, publish, user_id=user_id, chat_id=chat_id
        ),
        room=ctx.room,
    )
    session.say(GREETING, allow_interruptions=True)


if __name__ == "__main__":
    cli.run_app(server)
