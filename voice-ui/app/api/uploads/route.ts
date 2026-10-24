import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const chatId = new URL(request.url).searchParams.get("chatId");
  if (!chatId) return NextResponse.json({ detail: "Open a chat first." }, { status: 400 });
  const r = await apiFetch(`/api/uploads?chat_id=${encodeURIComponent(chatId)}`);
  return NextResponse.json(await r.json(), { status: r.status });
}
export async function POST(request: Request) {
  const form = await request.formData();
  const chatId = new URL(request.url).searchParams.get("chatId");
  if (!chatId) return NextResponse.json({ detail: "Open a chat first." }, { status: 400 });
  const r = await apiFetch(`/api/uploads?chat_id=${encodeURIComponent(chatId)}`, { method: "POST", body: form });
  return NextResponse.json(await r.json(), { status: r.status });
}
