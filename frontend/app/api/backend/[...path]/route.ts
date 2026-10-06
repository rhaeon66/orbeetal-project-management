import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const API_URL = process.env.API_URL || "http://127.0.0.1:8484";

async function refreshAccess() {
  const jar = await cookies();
  const refresh = jar.get("refresh")?.value;
  if (!refresh) return null;
  const upstream = await fetch(`${API_URL}/api/v1/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!upstream.ok) return null;
  const data = await upstream.json();
  return data as { access: string; refresh?: string };
}

async function forward(
  request: NextRequest,
  path: string[],
  access: string | undefined,
  body: ArrayBuffer | undefined,
) {
  const target = new URL(`${API_URL}/api/v1/${path.join("/")}/`);
  target.search = request.nextUrl.search;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (access) headers.set("authorization", `Bearer ${access}`);
  return fetch(target, { method: request.method, headers, body });
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: rawPath } = await context.params;
  const path = rawPath.filter(Boolean);
  const jar = await cookies();
  let access = jar.get("access")?.value;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;
  let upstream = await forward(request, path, access, body);
  const refreshed = upstream.status === 401 ? await refreshAccess() : null;
  const responseHeaders = new Headers();
  if (refreshed?.access) {
    access = refreshed.access;
    upstream = await forward(request, path, access, body);
    responseHeaders.append(
      "set-cookie",
      `access=${access}; HttpOnly; Path=/; SameSite=Lax; Max-Age=1800`,
    );
    if (refreshed.refresh) {
      responseHeaders.append(
        "set-cookie",
        `refresh=${refreshed.refresh}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`,
      );
    }
  }
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
