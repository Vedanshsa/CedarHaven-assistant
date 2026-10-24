import { cookies } from "next/headers";

const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function apiFetch(path: string, init: RequestInit = {}) {
  const jar = await cookies();
  const token = jar.get("cedarhaven_session")?.value;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${BACKEND}${path}`, { ...init, headers, cache: "no-store" });
}
