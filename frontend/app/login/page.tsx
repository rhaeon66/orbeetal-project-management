"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(body.detail || "Sign-in failed.");
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/orbeetal-icon.png" alt="" className="h-12 w-12 rounded-xl" />
            <div>
              <p className="text-lg font-semibold leading-tight">Orbeetal</p>
              <p className="text-xs uppercase tracking-wider text-slate-500">Device rental</p>
            </div>
          </div>
          <h1 className="text-2xl font-semibold">Sign in</h1>
        </div>
        {error ? <ErrorNote message={String(error)} /> : null}
        <Field label="Email">
          <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Password">
          <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <Button className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
