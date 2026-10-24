import { NextResponse } from "next/server";
import {
  AccessToken,
  type AccessTokenOptions,
  type VideoGrant,
} from "livekit-server-sdk";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { apiFetch } from "@/lib/api";

type ConnectionDetails = {
  serverUrl: string;
  participantToken: string;
};

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const auth = await apiFetch("/api/me");
    if (!auth.ok) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { user } = await auth.json();
    if (LIVEKIT_URL === undefined) {
      throw new Error("LIVEKIT_URL is not defined");
    }
    if (API_KEY === undefined) {
      throw new Error("LIVEKIT_API_KEY is not defined");
    }
    if (API_SECRET === undefined) {
      throw new Error("LIVEKIT_API_SECRET is not defined");
    }

    const body = await req.json().catch(() => ({}));
    const chatId = new URL(req.url).searchParams.get("chatId");
    if (!chatId || !/^[0-9a-f-]{36}$/i.test(chatId)) {
      return NextResponse.json({ error: "Open a chat before starting voice mode." }, { status: 400 });
    }
    const ownedChat = await apiFetch(`/api/chats/${encodeURIComponent(chatId)}/messages`);
    if (!ownedChat.ok) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    // This endpoint is user-scoped in the backend. Reject any malformed response
    // before minting a room token; the agent independently repeats the ownership check.
    const messages = await ownedChat.json();
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }
    const roomConfig = body?.room_config
      ? RoomConfiguration.fromJson(body.room_config, {
          ignoreUnknownFields: true,
        })
      : new RoomConfiguration();
    // TokenSource sessions dispatch the named agent from the token room config.
    // Preserve any requested room settings, while always binding dispatch metadata
    // to the authenticated account and the chat already checked above.
    roomConfig.agents = [new RoomAgentDispatch({
      agentName: process.env.AGENT_NAME || "assistant-b92",
      metadata: JSON.stringify({ user_id: user.id, chat_id: chatId }),
    })];

    const participantIdentity = `user_${user.id}`;
    const roomName = `cedarhaven_${user.id}_${chatId}_${crypto.randomUUID()}`;

    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: user.name },
      roomName,
      roomConfig,
    );

    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      participantToken,
    };
    const headers = new Headers({
      "Cache-Control": "no-store",
    });
    return NextResponse.json(data, { headers });
  } catch (error) {
    if (error instanceof Error) console.error("LiveKit token creation failed:", error.name);
    return NextResponse.json({ error: "Voice service is unavailable." }, { status: 503 });
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  roomConfig: RoomConfiguration | undefined,
): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: "15m",
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  if (roomConfig) {
    at.roomConfig = roomConfig;
  }

  return at.toJwt();
}
