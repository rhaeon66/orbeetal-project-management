import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://127.0.0.1:8484";

export async function POST() {
  const jar = await cookies();
  const refresh = jar.get("refresh")?.value;
  if (refresh) {
    await fetch(`${API_URL}/api/v1/auth/logout/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("access", "", { httpOnly: true, path: "/", maxAge: 0 });
  response.cookies.set("refresh", "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
