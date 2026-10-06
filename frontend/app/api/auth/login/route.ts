import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://127.0.0.1:8484";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const upstream = await fetch(`${API_URL}/api/v1/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }
  const response = NextResponse.json({ user: data.user });
  response.cookies.set("access", data.access, cookieOptions(60 * 30));
  response.cookies.set("refresh", data.refresh, cookieOptions(60 * 60 * 24 * 7));
  return response;
}
