"use client";

import { useEffect, useState } from "react";
import { useRoomContext } from "@livekit/components-react";

/** Topic the Python agent publishes verified answers on (see cedarhaven_voice.py). */
export const ANSWER_TOPIC = "cedarhaven.answer";

export type AnswerStatus =
  | "answered"
  | "gap"
  | "out_of_scope"
  | "extractive"
  | "greeting"
  | "empty";

export interface AnswerSource {
  id: string;
  doc_id: string;
  doc_title: string;
  page: number;
  section: string;
  heading: string;
  citation: string;
  kind: "fact" | "gap";
  quotes: string[];
}

export interface AnswerPayload {
  question: string;
  status: AnswerStatus;
  answer: string;
  sources: AnswerSource[];
  checks: {
    retrieved: { id: string; citation: string; heading: string; used: boolean }[];
    rejected: number;
    repaired: boolean;
    latency_ms?: number | null;
    model?: string | null;
    reason?: string | null;
  };
}

/** Latest verified answer published by the agent into this room (voice or typed question). */
export function useCedarhavenAnswers() {
  const room = useRoomContext();
  const [latest, setLatest] = useState<AnswerPayload | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!room) return;
    room.registerTextStreamHandler(ANSWER_TOPIC, async (reader, participant) => {
      if (participant.identity === room.localParticipant.identity) return;
      try {
        const text = await reader.readAll();
        const data = JSON.parse(text) as AnswerPayload;
        if (data && typeof data.answer === "string" && Array.isArray(data.sources)) {
          setLatest(data);
          setCount((c) => c + 1);
        }
      } catch (err) {
        console.warn("Ignoring malformed answer payload", err);
      }
    });
    return () => room.unregisterTextStreamHandler(ANSWER_TOPIC);
  }, [room]);

  return { latest, count };
}
