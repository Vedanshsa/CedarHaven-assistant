import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiFetch(`/api/chats/${encodeURIComponent(id)}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text() });
  return NextResponse.json(await r.json(), { status: r.status });
}
