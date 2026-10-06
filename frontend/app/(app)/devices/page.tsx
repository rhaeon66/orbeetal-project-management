"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, Page, SessionUser } from "@/lib/api";
import { Badge, Button, Empty, ErrorNote, Field, inputClass, Loading, Panel } from "@/components/ui";
import { Filters, Pager } from "@/components/pager";

type Device = {
  id: number;
  device_code: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  serial_number: string;
  status: string;
  current_user_name: string | null;
};

const emptyForm = {
  device_code: "",
  name: "",
  category: "",
  brand: "",
  model: "",
  serial_number: "",
  status: "available",
};

export default function DevicesPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [data, setData] = useState<Page<Device> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);

  function load(nextPage = page) {
    const params = new URLSearchParams({ page: String(nextPage), search });
    if (status) params.set("status", status);
    api<Page<Device>>(`devices/?${params}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    api<SessionUser>("auth/me/").then(setMe).catch(() => undefined);
  }, []);

  useEffect(() => {
    load(page);
  }, [page, search, status]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (editing) {
        await api(`devices/${editing}/`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await api("devices/", { method: "POST", body: JSON.stringify(form) });
      }
      setForm(emptyForm);
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Devices</h1>
      {error ? <ErrorNote message={error} /> : null}
      {me?.role === "admin" ? (
        <Panel title={editing ? "Edit device" : "Add device"}>
          <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
            {(["device_code", "name", "category", "brand", "model", "serial_number"] as const).map((key) => (
              <Field key={key} label={key.replaceAll("_", " ")}>
                <input className={inputClass} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={key !== "model"} />
              </Field>
            ))}
            <Field label="Status">
              <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="available">Available</option>
                <option value="assigned" disabled>Assigned</option>
                <option value="maintenance">Maintenance</option>
                <option value="retired">Retired</option>
              </select>
            </Field>
            <div className="flex items-end gap-2">
              <Button>{editing ? "Save" : "Create"}</Button>
              {editing ? (
                <Button type="button" tone="ghost" onClick={() => { setEditing(null); setForm(emptyForm); }}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </Panel>
      ) : null}
      <Filters>
        <input className={inputClass + " max-w-xs"} placeholder="Search name, serial, brand" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} />
        <select className={inputClass + " max-w-[180px]"} value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
          <option value="">All statuses</option>
          <option value="available">Available</option>
          <option value="assigned">Assigned</option>
          <option value="maintenance">Maintenance</option>
          <option value="retired">Retired</option>
        </select>
      </Filters>
      {!data ? <Loading /> : data.results.length === 0 ? (
        <Empty title="No devices" body={me?.role === "admin" ? "Add a device to start assigning it." : "You have no assigned devices yet."} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Code", "Name", "Category", "Brand / model", "Serial", "Status", "Current user", ""].map((heading) => (
                  <th key={heading} className="px-3 py-2 font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.results.map((device) => (
                <tr key={device.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{device.device_code}</td>
                  <td className="px-3 py-2 font-medium">{device.name}</td>
                  <td className="px-3 py-2">{device.category}</td>
                  <td className="px-3 py-2">{device.brand} {device.model}</td>
                  <td className="px-3 py-2">{device.serial_number}</td>
                  <td className="px-3 py-2"><Badge value={device.status} /></td>
                  <td className="px-3 py-2">{device.current_user_name || "—"}</td>
                  <td className="px-3 py-2">
                    {me?.role === "admin" ? (
                      <button className="text-slate-600 underline" onClick={() => { setEditing(device.id); setForm({ device_code: device.device_code, name: device.name, category: device.category, brand: device.brand, model: device.model, serial_number: device.serial_number, status: device.status }); }}>
                        Edit
                      </button>
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
