"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { TokenSource } from "livekit-client";
import { useSession, useSessionContext, useSessionMessages } from "@livekit/components-react";
import type { AppConfig } from "@/app-config";
import type { AnswerPayload } from "@/hooks/useCedarhavenAnswers";
import { ViewController } from "@/app/components/view-controller";
import { useAgentErrors } from "@/hooks/useAgentErrors";
import { useDebugMode } from "@/hooks/useDebug";
import { AgentSessionProvider } from "@/components/agents-ui/agent-session-provider";
import { StartAudioButton } from "@/components/agents-ui/start-audio-button";

const CONTROL_TOPIC = "cedarhaven.control";

export type SavedMessage = {
  id?: number | string;
  role: "user" | "assistant";
  content: string;
  sources?: (AnswerPayload["sources"][number] & { status?: AnswerPayload["status"] })[];
};

export function InlineVoiceCall({
  appConfig,
  chatId,
  onClose,
  onHistoryUpdate,
}: {
  appConfig: AppConfig;
  chatId: string;
  onClose: () => void;
  onHistoryUpdate: (messages: SavedMessage[]) => void;
}) {
  const tokenEndpoint = `/api/token?chatId=${encodeURIComponent(chatId)}`;
  const tokenSource = useMemo(() => TokenSource.endpoint(tokenEndpoint), [tokenEndpoint]);
  const session = useSession(
    tokenSource,
    appConfig.agentName ? { agentName: appConfig.agentName } : undefined,
  );

  return (
    <AgentSessionProvider session={session}>
      <VoiceOverlay
        appConfig={appConfig}
        chatId={chatId}
        onClose={onClose}
        onHistoryUpdate={onHistoryUpdate}
      />
    </AgentSessionProvider>
  );
}

function VoiceOverlay({
  appConfig,
  chatId,
  onClose,
  onHistoryUpdate,
}: {
  appConfig: AppConfig;
  chatId: string;
  onClose: () => void;
  onHistoryUpdate: (messages: SavedMessage[]) => void;
}) {
  const { end, isConnected, room } = useSessionContext();
  const callWasConnected = useRef(false);
  const closeNotified = useRef(false);
  const endingRef = useRef(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState("");

  useDebugMode({ enabled: process.env.NODE_ENV !== "production" });
  useAgentErrors();

  useEffect(() => {
    if (isConnected) {
      callWasConnected.current = true;
      return;
    }
    if (callWasConnected.current) {
      callWasConnected.current = false;
      if (!closeNotified.current) {
        closeNotified.current = true;
        onClose();
      }
    }
  }, [isConnected, onClose]);

  useEffect(() => {
    room.registerTextStreamHandler(CONTROL_TOPIC, async (reader, participant) => {
      if (participant.identity === room.localParticipant.identity) return;
      try {
        const payload: unknown = JSON.parse(await reader.readAll());
        if (
          typeof payload === "object" &&
          payload !== null &&
          "action" in payload &&
          payload.action === "end_call"
        ) {
          await end();
        }
      } catch (cause) {
        console.error("Could not process the voice call control message.", cause);
        setEndError("The voice assistant could not end the call. Use the End call button to disconnect.");
      }
    });
    return () => room.unregisterTextStreamHandler(CONTROL_TOPIC);
  }, [room, end]);

  async function closeCall() {
    if (endingRef.current) return;
    endingRef.current = true;
    setEnding(true);
    setEndError("");
    try {
      await end();
      if (!closeNotified.current) {
        closeNotified.current = true;
        onClose();
      }
    } catch (cause) {
      setEndError(cause instanceof Error ? cause.message : "Could not end the voice call. Please try again.");
    } finally {
      endingRef.current = false;
      setEnding(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Voice assistant"
      className="fixed inset-0 z-[90] overflow-hidden bg-white text-slate-900"
    >
      <div className="fixed inset-x-0 top-0 z-[110] flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur md:px-8">
        <div>
          <p className="text-sm font-semibold text-slate-900">Cedarhaven voice</p>
          <p className="text-xs text-slate-500">This conversation is saved to your selected chat.</p>
        </div>
        <button
          type="button"
          onClick={() => void closeCall()}
          disabled={ending}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
        >
          <X size={16} />
          <span className="hidden sm:inline">{ending ? "Ending call…" : "End call"}</span>
        </button>
      </div>

      {endError && (
        <p role="alert" className="fixed right-4 top-20 z-[120] max-w-sm rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-lg">
          {endError}
        </p>
      )}

      <main className="absolute inset-0 top-16 bg-gradient-to-br from-white via-sky-50 to-cyan-50">
        <ViewController appConfig={appConfig} />
      </main>

      <VoiceChatHistory chatId={chatId} onHistoryUpdate={onHistoryUpdate} />
      <StartAudioButton
        label="Enable audio"
        className="fixed bottom-5 right-5 z-[120] rounded-xl bg-cyan-700 text-white hover:bg-cyan-800"
      />
    </div>
  );
}

function VoiceChatHistory({
  chatId,
  onHistoryUpdate,
}: {
  chatId: string;
  onHistoryUpdate: (messages: SavedMessage[]) => void;
}) {
  const session = useSessionContext();
  const { messages: liveMessages } = useSessionMessages(session);
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [historyError, setHistoryError] = useState("");
  const pendingTranscripts = liveMessages
    .filter(message => message.from?.isLocal)
    .filter(message => !messages.some(saved =>
      saved.role === "user" && saved.content.trim() === message.message.trim(),
    ))
    .map(message => ({
      id: `live-${message.id}`,
      role: "user" as const,
      content: message.message,
      sources: undefined,
    }));
  const transcriptMessages = [...messages, ...pendingTranscripts];

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
        if (!response.ok) throw new Error("Saved transcript is unavailable.");
        if (active) {
          const rows: SavedMessage[] = await response.json();
          setMessages(rows);
          onHistoryUpdate(rows);
          setHistoryError("");
        }
      } catch {
        if (active) setHistoryError("Could not load the saved transcript. Check that the API is running and you are signed in.");
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 1800);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [chatId, onHistoryUpdate]);

  return (
    <aside className="fixed bottom-5 left-4 z-[110] w-[min(360px,calc(100vw-2rem))] md:left-8">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-xs font-medium text-slate-700 shadow-lg backdrop-blur hover:bg-white"
      >
        {open ? "Hide chat transcript" : `Chat transcript · ${transcriptMessages.length} messages`}
      </button>
      {open && (
        <section className="mt-2 max-h-[40vh] space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
          {historyError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{historyError}</p>}
          {transcriptMessages.length === 0 && (
            <p className="px-2 py-3 text-sm text-slate-500">Your recognized questions and answers will appear here.</p>
          )}
          {transcriptMessages.map(message => (
            <article key={message.id} className="rounded-xl bg-slate-50 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-800">
                {message.role === "user" ? "You" : "Cedarhaven"}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{message.content}</p>
              {message.sources?.map((source, index) => (
                <details key={`${message.id}-${index}`} className="mt-2 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium text-cyan-800">
                    {source.citation || "Evidence"}
                  </summary>
                  {source.quotes?.map((quote, quoteIndex) => (
                    <blockquote key={quoteIndex} className="mt-2 break-words border-l-2 border-cyan-600 pl-2 [overflow-wrap:anywhere]">
                      {quote}
                    </blockquote>
                  ))}
                </details>
              ))}
            </article>
          ))}
        </section>
      )}
    </aside>
  );
}
