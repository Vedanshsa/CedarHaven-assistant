import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiFetch(`/api/chats/${encodeURIComponent(id)}/messages`);
  return NextResponse.json(await r.json(), { status: r.status });
}
