import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
export async function GET() {
  const r = await apiFetch("/api/chats");
  return NextResponse.json(await r.json(), { status: r.status });
}
export async function POST() {
  const r = await apiFetch("/api/chats", { method: "POST" });
  return NextResponse.json(await r.json(), { status: r.status });
}
