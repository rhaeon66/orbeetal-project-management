export type Role = "admin" | "user";

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
};

export type Page<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    const detail = extractMessage(body);
    super(detail);
    this.status = status;
    this.body = body;
  }
}

function extractMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "Request failed.";
  const record = body as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) parts.push(`${key}: ${value.join(" ")}`);
    else if (typeof value === "string") parts.push(`${key}: ${value}`);
    else if (value && typeof value === "object") parts.push(`${key}: ${JSON.stringify(value)}`);
  }
  return parts.join(" ") || "Request failed.";
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`/api/backend/${path.replace(/^\//, "")}`, {
    ...options,
    headers,
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { detail: "The server could not complete that request." };
    }
  }
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiError(response.status, body);
  }
  return body as T;
}

export function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  const formatted = new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `৳${formatted}`;
}

export function monthName(month: number) {
  return new Date(2026, month - 1, 1).toLocaleString("en", { month: "long" });
}
