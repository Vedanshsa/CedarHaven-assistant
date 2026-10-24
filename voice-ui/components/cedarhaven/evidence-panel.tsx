"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useCedarhavenAnswers, type AnswerPayload, type AnswerStatus } from "@/hooks/useCedarhavenAnswers";

const BADGE: Record<AnswerStatus, { label: string; color: string }> = {
  answered: { label: "Verified answer", color: "#00f0ff" },
  gap: { label: "Not specified in the guides", color: "#ffc247" },
  out_of_scope: { label: "Outside the guides", color: "#9aa7bd" },
  extractive: { label: "Language model offline", color: "#ff7a7a" },
  greeting: { label: "Ready", color: "#9aa7bd" },
  empty: { label: "Ask a question", color: "#9aa7bd" },
};

/** Live evidence for the answer the agent just spoke: exact guide wording, section, page. */
export function EvidencePanel() {
  const { latest, count } = useCedarhavenAnswers();
  return <EvidenceView latest={latest} count={count} />;
}

export function EvidenceView({ latest, count }: { latest: AnswerPayload | null; count: number }) {
  const [open, setOpen] = useState(true);

  // A new answer always re-opens the panel so the evidence is visible while it is spoken.
  useEffect(() => {
    if (count > 0) setOpen(true);
  }, [count]);

  if (!latest) return null;
  const badge = BADGE[latest.status] ?? BADGE.empty;
  const used = latest.checks.retrieved.filter((r) => r.used).length;

  return (
    <aside
      aria-label="Evidence for the latest answer"
      className="pointer-events-none absolute top-4 right-4 z-40 flex w-[min(400px,calc(100vw-2rem))] flex-col items-end gap-2"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="pointer-events-auto rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide"
        style={{
          borderColor: `${badge.color}66`,
          color: badge.color,
          background: "rgba(3,7,18,0.85)",
        }}
      >
        {open ? "Hide evidence" : "Show evidence"} · {badge.label}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={count}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto max-h-[62vh] w-full overflow-y-auto rounded-2xl border p-4 text-sm"
            style={{
              borderColor: `${badge.color}40`,
              background: "rgba(3,7,18,0.92)",
              color: "#dce6f7",
            }}
          >
            <p className="mb-1 text-xs" style={{ color: "#8da2c4" }}>
              You asked
            </p>
            <p className="mb-3 leading-snug">{latest.question}</p>

            {latest.sources.length === 0 && (
              <p style={{ color: "#8da2c4" }}>
                This answer does not rest on a guide passage.
              </p>
            )}

            {latest.sources.map((s) => (
              <section
                key={s.id}
                className="mb-3 border-t pt-3"
                style={{ borderColor: "rgba(160,196,255,0.15)" }}
              >
                <p className="font-semibold" style={{ color: s.kind === "gap" ? "#ffc247" : "#00f0ff" }}>
                  {s.section} · {s.heading}
                </p>
                <p className="mb-2 text-xs" style={{ color: "#8da2c4" }}>
                  {s.doc_id} · {s.doc_title} · page {s.page}
                </p>
                {s.quotes.map((q) => (
                  <blockquote
                    key={q}
                    className="rounded-r-md border-l-2 px-3 py-2 leading-relaxed"
                    style={{
                      borderColor: s.kind === "gap" ? "#ffc247" : "#00f0ff",
                      background: "rgba(0,240,255,0.07)",
                    }}
                  >
                    {q}
                  </blockquote>
                ))}
                {(latest.status === "answered" || latest.status === "gap") && (
                  <p className="mt-1 text-xs" style={{ color: "#5fe3b0" }}>
                    ✓ Wording found in the guide
                  </p>
                )}
              </section>
            ))}

            <p className="border-t pt-2 text-xs" style={{ borderColor: "rgba(160,196,255,0.15)", color: "#8da2c4" }}>
              {latest.checks.retrieved.length > 0
                ? `Searched all three guides, ${latest.checks.retrieved.length} passages pulled, ${used} support this answer.`
                : "No guide passage matched closely enough, so no answer was drafted."}
              {latest.checks.rejected > 0 &&
                ` ${latest.checks.rejected} drafted statement${latest.checks.rejected > 1 ? "s were" : " was"} removed because the wording could not be found in the guide.`}
              {latest.checks.reason ? ` ${latest.checks.reason}` : ""}
              {latest.checks.latency_ms != null ? ` (${latest.checks.latency_ms} ms)` : ""}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
