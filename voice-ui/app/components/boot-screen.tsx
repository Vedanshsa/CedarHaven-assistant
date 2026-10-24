"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const BOOT_LINES = [
  { text: "CEDARHAVEN ASSISTANT — STARTING...", delay: 0, color: "#00f0ff" },
  { text: "> Loading the three town guides...", delay: 600, color: "#a0c4ff" },
  {
    text: "> Preparing the voice engine...",
    delay: 1100,
    color: "#a0c4ff",
  },
  {
    text: "> Opening a secure LiveKit connection...",
    delay: 1600,
    color: "#a0c4ff",
  },
  {
    text: "> Connecting the answer checker...",
    delay: 2100,
    color: "#a0c4ff",
  },
  {
    text: "> Starting speech recognition and voice...",
    delay: 2600,
    color: "#a0c4ff",
  },
  { text: "✓ READY — ASK ABOUT CEDARHAVEN", delay: 3100, color: "#00f0ff" },
];

interface BootScreenProps {
  onComplete: () => void;
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="mx-auto mt-8 w-full max-w-md">
      <div
        style={{
          background: "rgba(0, 240, 255, 0.08)",
          border: "1px solid rgba(0, 240, 255, 0.2)",
          borderRadius: "2px",
          height: "3px",
          overflow: "hidden",
        }}
      >
        <motion.div
          style={{
            height: "100%",
            background: "linear-gradient(90deg, #1e3fef, #00f0ff)",
            boxShadow: "0 0 12px rgba(0, 240, 255, 0.8)",
          }}
          initial={{ width: "0%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <div
        className="mt-2 text-right text-xs"
        style={{
          color: "rgba(0, 240, 255, 0.5)",
          fontFamily: "'Orbitron', monospace",
        }}
      >
        {Math.round(progress)}%
      </div>
    </div>
  );
}

function HexGrid() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity: 0.06 }}
    >
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id="hex"
            x="0"
            y="0"
            width="50"
            height="57.735"
            patternUnits="userSpaceOnUse"
          >
            <polygon
              points="25,0 50,14.434 50,43.301 25,57.735 0,43.301 0,14.434"
              fill="none"
              stroke="#00f0ff"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hex)" />
      </svg>
    </div>
  );
}

function CoreOrb() {
  return (
    <div
      className="relative mb-12 flex items-center justify-center"
      style={{ width: 160, height: 160 }}
    >
      {/* Outer ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 160,
          height: 160,
          border: "1px solid rgba(0, 240, 255, 0.15)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      />
      {/* Middle ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 120,
          height: 120,
          border: "1px solid rgba(138, 43, 226, 0.3)",
          borderTopColor: "rgba(138, 43, 226, 0.8)",
        }}
        animate={{ rotate: -360 }}
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
      />
      {/* Inner ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 90,
          height: 90,
          border: "1px solid rgba(0, 240, 255, 0.2)",
          borderTopColor: "#00f0ff",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
      {/* Core */}
      <motion.div
        className="relative z-10 flex items-center justify-center rounded-full"
        style={{
          width: 64,
          height: 64,
          background:
            "radial-gradient(circle, rgba(0,240,255,0.3) 0%, rgba(30,63,239,0.2) 100%)",
          boxShadow:
            "0 0 30px rgba(0, 240, 255, 0.4), 0 0 80px rgba(0, 240, 255, 0.15)",
        }}
        animate={{
          boxShadow: [
            "0 0 30px rgba(0, 240, 255, 0.4), 0 0 80px rgba(0, 240, 255, 0.15)",
            "0 0 50px rgba(0, 240, 255, 0.7), 0 0 120px rgba(0, 240, 255, 0.3)",
            "0 0 30px rgba(0, 240, 255, 0.4), 0 0 80px rgba(0, 240, 255, 0.15)",
          ],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg width="30" height="30" viewBox="0 0 44 44" fill="none">
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
      </motion.div>
    </div>
  );
}

export function BootScreen({ onComplete }: BootScreenProps) {
  const [visibleLines, setVisibleLines] = useState<number[]>([]);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    BOOT_LINES.forEach((line, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleLines((prev) => [...prev, i]);
          setProgress(((i + 1) / BOOT_LINES.length) * 100);
        }, line.delay),
      );
    });

    // Trigger exit after all lines displayed
    timers.push(
      setTimeout(
        () => {
          setExiting(true);
        },
        BOOT_LINES[BOOT_LINES.length - 1].delay + 700,
      ),
    );

    timers.push(
      setTimeout(
        () => {
          onComplete();
        },
        BOOT_LINES[BOOT_LINES.length - 1].delay + 1300,
      ),
    );

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          className="fixed inset-0 z-9999 flex flex-col items-center justify-center overflow-hidden"
          style={{ background: "#030712" }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          <HexGrid />

          {/* Scan line */}
          <motion.div
            className="pointer-events-none absolute right-0 left-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(0,240,255,0.4), transparent)",
              boxShadow: "0 0 20px rgba(0, 240, 255, 0.2)",
            }}
            animate={{ top: ["0%", "100%"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />

          <div className="relative z-10 flex w-full max-w-2xl flex-col items-center px-6">
            <CoreOrb />

            {/* Title */}
            <motion.div
              className="mb-8 text-center"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <h1
                className="mb-1 text-4xl font-black uppercase"
                style={{
                  fontFamily: "'Orbitron', monospace",
                  letterSpacing: "0.25em",
                  color: "#00f0ff",
                  textShadow:
                    "0 0 20px rgba(0, 240, 255, 0.8), 0 0 60px rgba(0, 240, 255, 0.3)",
                }}
              >
                CEDARHAVEN
              </h1>
              <p
                className="text-sm uppercase"
                style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  letterSpacing: "0.4em",
                  color: "rgba(0, 240, 255, 0.4)",
                }}
              >
                Municipal Voice Assistant
              </p>
            </motion.div>

            {/* Terminal lines */}
            <div
              className="w-full max-w-md overflow-hidden rounded-sm"
              style={{
                background: "rgba(0, 240, 255, 0.03)",
                border: "1px solid rgba(0, 240, 255, 0.1)",
              }}
            >
              <div
                className="flex items-center gap-2 px-3 py-1.5"
                style={{ borderBottom: "1px solid rgba(0, 240, 255, 0.08)" }}
              >
                <div className="flex gap-1">
                  {["#ff5f57", "#ffbd2e", "#28ca41"].map((c, i) => (
                    <div
                      key={i}
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: c, opacity: 0.6 }}
                    />
                  ))}
                </div>
                <span
                  className="text-xs"
                  style={{
                    fontFamily: "'Orbitron', monospace",
                    color: "rgba(0, 240, 255, 0.3)",
                  }}
                >
                  SYSTEM_BOOT.LOG
                </span>
              </div>
              <div
                className="space-y-0.5 px-4 py-3 text-xs"
                style={{ minHeight: "180px", lineHeight: "1.75rem" }}
              >
                <AnimatePresence>
                  {BOOT_LINES.map(
                    (line, i) =>
                      visibleLines.includes(i) && (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3 }}
                          style={{
                            color: line.color,
                            textShadow:
                              line.color === "#00f0ff"
                                ? "0 0 8px rgba(0, 240, 255, 0.6)"
                                : "none",
                            fontFamily: "'Orbitron', monospace",
                            fontSize: "11px",
                          }}
                        >
                          {line.text}
                          {i === visibleLines[visibleLines.length - 1] &&
                            i < BOOT_LINES.length - 1 && (
                              <motion.span
                                animate={{ opacity: [1, 0] }}
                                transition={{ duration: 0.5, repeat: Infinity }}
                                style={{ color: "#00f0ff" }}
                              >
                                _
                              </motion.span>
                            )}
                        </motion.div>
                      ),
                  )}
                </AnimatePresence>
              </div>
            </div>

            <ProgressBar progress={progress} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
