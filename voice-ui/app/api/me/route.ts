import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
export async function GET() {
  const r = await apiFetch("/api/me");
  return NextResponse.json(await r.json(), { status: r.status });
}
