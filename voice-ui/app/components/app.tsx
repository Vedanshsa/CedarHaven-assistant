"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TokenSource } from "livekit-client";
import { useSession } from "@livekit/components-react";
import type { AppConfig } from "@/app-config";
import { AgentSessionProvider } from "@/components/agents-ui/agent-session-provider";
import { BootScreen } from "@/app/components/boot-screen";
import { ViewController } from "@/app/components/view-controller";
import { useAgentErrors } from "@/hooks/useAgentErrors";
import { useDebugMode } from "@/hooks/useDebug";
import { AccountChat } from "@/app/components/account-chat";
import { StartAudioButton } from "@/components/agents-ui/start-audio-button";

type SavedMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources?: { citation?: string; quotes?: string[] }[];
};

const IN_DEVELOPMENT = process.env.NODE_ENV !== "production";

function AppSetup() {
  useDebugMode({ enabled: IN_DEVELOPMENT });
  useAgentErrors();
  return null;
}

interface AppProps {
  appConfig: AppConfig;
}

export function App({ appConfig }: AppProps) {
  const [voiceRoute, setVoiceRoute] = useState(false);

  useEffect(() => {
    setVoiceRoute(window.location.pathname === "/voice");
  }, []);

  if (voiceRoute) return <VoiceApp appConfig={appConfig} />;

  return <AccountChat />;
}

function VoiceApp({ appConfig }: AppProps) {
  const [bootComplete, setBootComplete] = useState(false);
  const handleBootComplete = useCallback(() => setBootComplete(true), []);

  const [tokenEndpoint, setTokenEndpoint] = useState("/api/token");
  const [voiceChatId, setVoiceChatId] = useState("");
  useEffect(() => {
    const chatId = new URLSearchParams(window.location.search).get("chatId");
    if (chatId) {
      setVoiceChatId(chatId);
      setTokenEndpoint(`/api/token?chatId=${encodeURIComponent(chatId)}`);
    }
  }, []);
  const tokenSource = useMemo(() => TokenSource.endpoint(tokenEndpoint), [tokenEndpoint]);
  const session = useSession(tokenSource, appConfig.agentName ? { agentName: appConfig.agentName } : undefined);

  if (!voiceChatId) {
    return <main className="grid min-h-screen place-content-center bg-[#050a12] px-6 text-center text-slate-100">
      <section className="max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6">
        <h1 className="text-xl font-semibold">Open a saved chat to start voice mode</h1>
        <p className="mt-2 text-sm text-slate-400">Voice messages are saved to the selected chat in your account.</p>
        <a href="/" className="mt-5 inline-block rounded-lg bg-cyan-300 px-4 py-2 font-medium text-slate-950">Back to chats</a>
      </section>
    </main>;
  }

  return (
    <>
      {/* Boot screen overlay — always rendered until complete */}
      {!bootComplete && <BootScreen onComplete={handleBootComplete} />}

      <AgentSessionProvider session={session}>
        <AppSetup />
        <a href="/" className="fixed left-4 top-4 z-[100] rounded-lg border border-cyan-800 bg-slate-950/90 px-3 py-2 text-sm text-cyan-200">Back to saved chat</a>
        {voiceChatId && <VoiceChatHistory chatId={voiceChatId} />}
        <main
          className="grid h-svh grid-cols-1 place-content-center"
          style={{
            opacity: bootComplete ? 1 : 0,
            transition: "opacity 0.3s ease-in-out",
          }}
        >
          <ViewController appConfig={appConfig} />
        </main>
        <StartAudioButton label="Start Audio" />
      </AgentSessionProvider>
    </>
  );
}

function VoiceChatHistory({ chatId }: { chatId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SavedMessage[]>([]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
        if (response.ok && active) setMessages(await response.json());
      } catch { /* Keep the last saved messages on brief network interruptions. */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [chatId]);

  return <div className="fixed left-4 top-16 z-[100] w-[min(340px,calc(100vw-2rem))]">
    <button onClick={() => setOpen(value => !value)} className="rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-sm text-slate-200">
      {open ? "Hide saved chat" : `Saved chat · ${messages.length} messages`}
    </button>
    {open && <section className="mt-2 max-h-[60vh] space-y-3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/95 p-3 shadow-xl">
      {messages.length === 0 && <p className="text-sm text-slate-400">Voice turns will appear here as text.</p>}
      {messages.map(message => <article key={message.id} className="rounded-lg bg-slate-900 p-3">
        <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">{message.role === "user" ? "You" : "Cedarhaven"}</p>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{message.content}</p>
        {message.sources?.map((source, index) => <details key={`${message.id}-${index}`} className="mt-2 text-xs text-cyan-200">
          <summary className="cursor-pointer">{source.citation || "Evidence"}</summary>
          {source.quotes?.map((quote, quoteIndex) => <blockquote key={quoteIndex} className="mt-2 border-l border-cyan-700 pl-2 text-slate-400">{quote}</blockquote>)}
        </details>)}
      </article>)}
    </section>}
  </div>;
}
