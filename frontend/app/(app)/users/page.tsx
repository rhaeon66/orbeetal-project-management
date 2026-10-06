"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, Page } from "@/lib/api";
import { Badge, Button, Empty, ErrorNote, Field, inputClass, Loading, Panel } from "@/components/ui";
import { Filters, Pager } from "@/components/pager";

type UserRow = { id: number; email: string; name: string; role: string; is_active: boolean };

const blank = { email: "", name: "", role: "user", password: "", is_active: true };

export default function UsersPage() {
  const [data, setData] = useState<Page<UserRow> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");

  function load(nextPage = page) {
    const params = new URLSearchParams({ page: String(nextPage), search });
    if (role) params.set("role", role);
    api<Page<UserRow>>(`users/?${params}`).then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load(page);
  }, [page, search, role]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const payload: Record<string, unknown> = {
      email: form.email,
      name: form.name,
      role: form.role,
      is_active: form.is_active,
    };
    if (form.password) payload.password = form.password;
    try {
      if (editing) await api(`users/${editing}/`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api("users/", { method: "POST", body: JSON.stringify(payload) });
      setForm(blank);
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Users</h1>
      {error ? <ErrorNote message={error} /> : null}
      <Panel title={editing ? "Edit user" : "Add user"}>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
          <Field label="Name"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
          <Field label="Email"><input className={inputClass} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
          <Field label="Password"><input className={inputClass} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!editing} placeholder={editing ? "Leave blank to keep" : ""} /></Field>
          <Field label="Role">
            <select className={inputClass} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Active">
            <select className={inputClass} value={String(form.is_active)} onChange={(event) => setForm({ ...form, is_active: event.target.value === "true" })}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <Button>{editing ? "Save" : "Create"}</Button>
            {editing ? <Button type="button" tone="ghost" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</Button> : null}
          </div>
        </form>
      </Panel>
      <Filters>
        <input className={inputClass + " max-w-xs"} placeholder="Search name or email" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} />
        <select className={inputClass + " max-w-[160px]"} value={role} onChange={(event) => { setPage(1); setRole(event.target.value); }}>
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>
      </Filters>
      {!data ? <Loading /> : data.results.length === 0 ? <Empty title="No users" body="Create a rental user to assign devices." /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500"><tr>{["Name", "Email", "Role", "Status", ""].map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr></thead>
            <tbody>
              {data.results.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{user.name}</td>
                  <td className="px-3 py-2">{user.email}</td>
                  <td className="px-3 py-2"><Badge value={user.role} /></td>
                  <td className="px-3 py-2"><Badge value={user.is_active ? "active" : "inactive"} /></td>
                  <td className="px-3 py-2"><button className="underline" onClick={() => { setEditing(user.id); setForm({ email: user.email, name: user.name, role: user.role, password: "", is_active: user.is_active }); }}>Edit</button></td>
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
