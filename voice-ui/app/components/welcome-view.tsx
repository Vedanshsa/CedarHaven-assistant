"use client";

import { cn } from "@/lib/shadcn/utils";

function CedarhavenLogo() {
  return (
    <div className="relative mb-8 flex items-center justify-center">
      {/* Outer glow ring */}
      <div
        className="absolute rounded-full"
        style={{
          width: 120,
          height: 120,
          background:
            "radial-gradient(circle, rgba(0,240,255,0.08) 0%, transparent 70%)",
        }}
      />
      {/* Logo */}
      <div
        className="relative z-10 flex items-center justify-center rounded-full"
        style={{
          width: 80,
          height: 80,
          background:
            "radial-gradient(circle, rgba(0,240,255,0.12) 0%, rgba(30,63,239,0.08) 100%)",
          border: "1px solid rgba(0, 240, 255, 0.2)",
          boxShadow:
            "0 0 30px rgba(0, 240, 255, 0.2), 0 0 80px rgba(0, 240, 255, 0.08)",
        }}
      >
        <svg width="40" height="40" viewBox="0 0 44 44" fill="none">
          <path
            d="M8 10L22 34L36 10"
            stroke="#00f0ff"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 10L22 26L30 10"
            stroke="#00f0ff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.4"
          />
        </svg>
      </div>
    </div>
  );
}

interface WelcomeViewProps {
  startButtonText: string;
  onStartCall: () => void;
}

export const WelcomeView = ({
  startButtonText,
  onStartCall,
  ref,
}: React.ComponentProps<"div"> & WelcomeViewProps) => {
  return (
    <div ref={ref}>
      <section className="flex flex-col items-center justify-center text-center">
        <CedarhavenLogo />

        <h1
          className="mb-2 text-3xl font-black uppercase tracking-[0.2em]"
          style={{
            fontFamily: "'Orbitron', monospace",
            color: "#00f0ff",
            textShadow:
              "0 0 20px rgba(0, 240, 255, 0.6), 0 0 60px rgba(0, 240, 255, 0.2)",
          }}
        >
          CEDARHAVEN
        </h1>

        <p
          className="mb-1 text-sm uppercase tracking-[0.3em]"
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            color: "rgba(0, 240, 255, 0.4)",
          }}
        >
          Municipal Voice Assistant
        </p>

        <p
          className="max-w-prose pt-2 text-sm leading-6"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            color: "rgba(160, 196, 255, 0.5)",
          }}
        >
          Ask about service requests, by-laws, permits and licences. Every answer is checked against the town guides and shown with its source.
        </p>

        <button
          onClick={onStartCall}
          className={cn(
            "mt-8 w-64 cursor-pointer rounded-full px-6 py-3",
            "text-xs font-bold uppercase tracking-[0.2em]",
            "transition-all duration-300",
          )}
          style={{
            fontFamily: "'Orbitron', monospace",
            background: "rgba(0, 240, 255, 0.1)",
            border: "1px solid rgba(0, 240, 255, 0.3)",
            color: "#00f0ff",
            boxShadow: "0 0 20px rgba(0, 240, 255, 0.15)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0, 240, 255, 0.2)";
            e.currentTarget.style.boxShadow =
              "0 0 30px rgba(0, 240, 255, 0.3), 0 0 60px rgba(0, 240, 255, 0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(0, 240, 255, 0.1)";
            e.currentTarget.style.boxShadow =
              "0 0 20px rgba(0, 240, 255, 0.15)";
          }}
        >
          {startButtonText}
        </button>
      </section>

      <div className="fixed bottom-5 left-0 flex w-full items-center justify-center">
        <p
          className="max-w-prose text-xs leading-5"
          style={{ color: "rgba(0, 240, 255, 0.2)" }}
        >
          Voice interface based on Vimora by Varshit Tyagi & Mohini Teotia
        </p>
      </div>
    </div>
  );
};
