"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, Page, SessionUser } from "@/lib/api";
import { Badge, Button, Empty, ErrorNote, Field, inputClass, Loading, Panel } from "@/components/ui";
import { Filters, Pager } from "@/components/pager";

type Assignment = {
  id: number;
  device: number;
  device_name: string;
  device_code: string;
  user: number;
  user_name: string;
  started_at: string;
  ended_at: string | null;
  notes: string;
};

type Option = { id: number; name: string; email?: string; device_code?: string };

export default function AssignmentsPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [data, setData] = useState<Page<Assignment> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");
  const [devices, setDevices] = useState<Option[]>([]);
  const [users, setUsers] = useState<Option[]>([]);
  const [form, setForm] = useState({ device: "", user: "", notes: "" });
  const [error, setError] = useState("");

  function load(nextPage = page) {
    const params = new URLSearchParams({ page: String(nextPage), search });
    if (active) params.set("active", active);
    api<Page<Assignment>>(`assignments/?${params}`).then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => {
    api<SessionUser>("auth/me/").then(async (user) => {
      setMe(user);
      if (user.role === "admin") {
        const [devicePage, userPage] = await Promise.all([
          api<Page<Option>>("devices/?page_size=100"),
          api<Page<Option>>("users/?role=user&is_active=true&page_size=100"),
        ]);
        setDevices(devicePage.results);
        setUsers(userPage.results);
      }
    });
  }, []);

  useEffect(() => {
    load(page);
  }, [page, search, active]);

  async function assign(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("assignments/", {
        method: "POST",
        body: JSON.stringify({ device: Number(form.device), user: Number(form.user), notes: form.notes }),
      });
      setForm({ device: "", user: "", notes: "" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed.");
    }
  }

  async function close(id: number) {
    setError("");
    try {
      await api(`assignments/${id}/close/`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close assignment.");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Assignments</h1>
      <p className="text-sm text-slate-500">Transferring a device closes the current assignment and keeps earlier reports.</p>
      {error ? <ErrorNote message={error} /> : null}
      {me?.role === "admin" ? (
        <Panel title="Assign or transfer">
          <form onSubmit={assign} className="grid gap-3 md:grid-cols-4">
            <Field label="Device">
              <select className={inputClass} value={form.device} onChange={(event) => setForm({ ...form, device: event.target.value })} required>
                <option value="">Select</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>{device.device_code} · {device.name}</option>
                ))}
              </select>
            </Field>
            <Field label="User">
              <select className={inputClass} value={form.user} onChange={(event) => setForm({ ...form, user: event.target.value })} required>
                <option value="">Select</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <input className={inputClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>
            <div className="flex items-end"><Button>Assign</Button></div>
          </form>
        </Panel>
      ) : null}
      <Filters>
        <input className={inputClass + " max-w-xs"} placeholder="Search device or user" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} />
        <select className={inputClass + " max-w-[180px]"} value={active} onChange={(event) => { setPage(1); setActive(event.target.value); }}>
          <option value="">All history</option>
          <option value="true">Active</option>
          <option value="false">Closed</option>
        </select>
      </Filters>
      {!data ? <Loading /> : data.results.length === 0 ? <Empty title="No assignments" body="Assignments appear here after a device is given to a user." /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Device", "User", "Started", "Ended", "Notes", ""].map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {data.results.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.device_code} · {row.device_name}</td>
                  <td className="px-3 py-2">{row.user_name}</td>
                  <td className="px-3 py-2">{new Date(row.started_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{row.ended_at ? new Date(row.ended_at).toLocaleString() : <Badge value="assigned" />}</td>
                  <td className="px-3 py-2">{row.notes || "—"}</td>
                  <td className="px-3 py-2">
                    {me?.role === "admin" && !row.ended_at ? (
                      <button className="text-slate-600 underline" onClick={() => close(row.id)}>End</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} data={data} onPage={setPage} />
    </div>
  );
}
