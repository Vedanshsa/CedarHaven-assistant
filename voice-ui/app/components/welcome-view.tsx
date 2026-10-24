"use client";

import { Mic, ShieldCheck } from "lucide-react";

interface WelcomeViewProps {
  startButtonText: string;
  onStartCall: () => void;
}

export const WelcomeView = ({
  startButtonText,
  onStartCall,
  ref,
}: React.ComponentProps<"div"> & WelcomeViewProps) => (
  <div ref={ref} className="grid h-full place-items-center px-5 py-10">
    <section className="w-full max-w-lg rounded-[2rem] border border-white bg-white/90 px-7 py-10 text-center shadow-[0_24px_80px_-28px_rgba(15,23,42,0.2)] backdrop-blur sm:px-12">
      <div className="mx-auto mb-6 grid size-16 place-items-center rounded-2xl bg-cyan-800 text-white shadow-lg shadow-cyan-900/15">
        <Mic size={27} />
      </div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-800">Cedarhaven assistant</p>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Talk to your guides</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
        Ask about services, by-laws, permits, or your uploaded PDFs. Your question and the evidence-grounded answer are saved to this chat.
      </p>
      <button
        type="button"
        onClick={onStartCall}
        className="mt-8 inline-flex min-w-56 items-center justify-center gap-2 rounded-xl bg-cyan-800 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-cyan-900/15 transition hover:-translate-y-0.5 hover:bg-cyan-900"
      >
        <Mic size={17} />
        {startButtonText}
      </button>
      <div className="mt-6 inline-flex items-center gap-2 text-xs text-slate-400">
        <ShieldCheck size={14} className="text-cyan-700" />
        Private to your account and this chat
      </div>
    </section>
  </div>
);
