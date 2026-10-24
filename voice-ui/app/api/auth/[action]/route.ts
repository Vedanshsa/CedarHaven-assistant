import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!["signup", "login", "logout"].includes(action)) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  try {
    const body = action === "logout" ? {} : await request.json();
    const jar = await import("next/headers").then((m) => m.cookies());
    const existing = jar.get("cedarhaven_session")?.value;
    const upstream = await fetch(`${BACKEND}/api/auth/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(action === "logout" && existing ? { Authorization: `Bearer ${existing}` } : {}) }, body: JSON.stringify(body), cache: "no-store",
    });
    const data = await upstream.json();
    const responseData = { ...data };
    delete responseData.token;
    const response = NextResponse.json(responseData, { status: upstream.status });
    if (upstream.ok && data.token) {
      response.cookies.set("cedarhaven_session", data.token, {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
        maxAge: 60 * 60 * 24 * 14,
      });
    }
    if (action === "logout") response.cookies.delete("cedarhaven_session");
    return response;
  } catch { return NextResponse.json({ detail: "The account service is unavailable." }, { status: 503 }); }
}
