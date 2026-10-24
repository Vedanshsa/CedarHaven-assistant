import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chatId = new URL(request.url).searchParams.get("chatId");
  if (!chatId) return NextResponse.json({ detail: "Open a chat first." }, { status: 400 });

  const response = await apiFetch(
    `/api/uploads/${encodeURIComponent(id)}?chat_id=${encodeURIComponent(chatId)}`,
    { method: "DELETE" },
  );
  return NextResponse.json(await response.json(), { status: response.status });
}
