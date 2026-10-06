"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { SessionUser, api } from "@/lib/api";

const links = [
  { href: "/dashboard", label: "Dashboard", roles: ["admin", "user"] },
  { href: "/devices", label: "Devices", roles: ["admin", "user"] },
  { href: "/assignments", label: "Assignments", roles: ["admin", "user"] },
  { href: "/reports", label: "Reports", roles: ["admin", "user"] },
  { href: "/settlements", label: "Settlements", roles: ["admin", "user"] },
  { href: "/payments", label: "Payments", roles: ["admin", "user"] },
  { href: "/users", label: "Users", roles: ["admin"] },
  { href: "/fields", label: "Report fields", roles: ["admin"] },
  { href: "/rules", label: "Commission rules", roles: ["admin"] },
  { href: "/audit", label: "Audit log", roles: ["admin"] },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<SessionUser>("auth/me/")
      .then(setUser)
      .catch(() => router.replace("/login"));
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (!user) {
    return <p className="p-8 text-sm text-slate-500">Loading account…</p>;
  }

  const visible = links.filter((link) => link.roles.includes(user.role));

  if (user.role === "user") {
    const userLinks = [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/payments", label: "Payment" },
      { href: "/details", label: "Details" },
    ];
    return (
      <div className="min-h-screen bg-[#f3f6fb]">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-2">
              <img src="/orbeetal-icon.png" alt="" className="h-9 w-9 rounded-lg" />
              <div className="leading-tight">
                <p className="text-lg font-bold tracking-tight">Orbeetal</p>
                <p className="text-xs text-slate-500">Device Rental</p>
              </div>
            </div>
            <nav className="flex items-center gap-1">
              {userLinks.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link key={link.href} href={link.href} className={`rounded-xl px-4 py-2 text-sm ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-100 text-violet-700">{user.name.slice(0, 1)}</span>
                {user.name}
              </span>
              <button onClick={logout} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600">Sign out</button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-slate-200 bg-slate-950 text-slate-100 lg:min-h-screen lg:border-b-0">
        <div className="flex items-center gap-3 px-4 py-5">
          <img src="/orbeetal-icon.png" alt="" className="h-10 w-10 rounded-lg" />
          <div>
            <p className="text-lg font-semibold leading-tight">Orbeetal</p>
            <p className="text-xs text-slate-400">Device Rental</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:block lg:space-y-1 lg:px-3">
          {visible.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                  active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div>
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="text-xs capitalize text-slate-500">{user.role}</p>
          </div>
          <button onClick={logout} className="text-sm text-slate-600 hover:text-slate-900">
            Sign out
          </button>
        </header>
        <main className="space-y-4 p-4 sm:p-6">
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {children}
        </main>
      </div>
    </div>
  );
}

export function useQueryState(initial: Record<string, string>) {
  const [query, setQuery] = useState(initial);
  function set(key: string, value: string) {
    setQuery((current) => ({ ...current, [key]: value, page: key === "page" ? value : "1" }));
  }
  return { query, set };
}
