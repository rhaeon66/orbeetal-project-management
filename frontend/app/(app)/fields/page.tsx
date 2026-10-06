"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, Page } from "@/lib/api";
import { Badge, Button, Empty, ErrorNote, Field, inputClass, Loading, Panel } from "@/components/ui";

type ReportField = {
  id: number;
  key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  is_calculated: boolean;
  formula: string;
};

const blank = {
  key: "",
  label: "",
  field_type: "currency",
  is_required: false,
  is_active: true,
  sort_order: 10,
  is_calculated: false,
  formula: "",
};

export default function FieldsPage() {
  const [rows, setRows] = useState<ReportField[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    api<Page<ReportField>>("report-fields/?page_size=100")
      .then((page) => setRows(page.results))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const payload = { ...form, formula: form.is_calculated ? form.formula : "" };
    try {
      if (editing) await api(`report-fields/${editing}/`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api("report-fields/", { method: "POST", body: JSON.stringify(payload) });
      setForm(blank);
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Report fields</h1>
      <p className="text-sm text-slate-500">Calculated values such as <span className="font-mono">income - cost</span> are computed by the server.</p>
      {error ? <ErrorNote message={error} /> : null}
      <Panel title={editing ? "Edit field" : "Add field"}>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
          <Field label="Label"><input className={inputClass} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} required /></Field>
          <Field label="Key"><input className={inputClass} value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} required disabled={Boolean(editing)} /></Field>
          <Field label="Type">
            <select className={inputClass} value={form.field_type} onChange={(event) => setForm({ ...form, field_type: event.target.value })}>
              {["currency", "number", "percentage", "text", "date", "boolean"].map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </Field>
          <Field label="Sort order"><input className={inputClass} type="number" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: Number(event.target.value) })} /></Field>
          <Field label="Required">
            <select className={inputClass} value={String(form.is_required)} onChange={(event) => setForm({ ...form, is_required: event.target.value === "true" })}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </Field>
          <Field label="Active">
            <select className={inputClass} value={String(form.is_active)} onChange={(event) => setForm({ ...form, is_active: event.target.value === "true" })}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </Field>
          <Field label="Calculated">
            <select className={inputClass} value={String(form.is_calculated)} onChange={(event) => setForm({ ...form, is_calculated: event.target.value === "true" })}>
              <option value="false">Entered by user</option>
              <option value="true">Calculated</option>
            </select>
          </Field>
          {form.is_calculated ? (
            <Field label="Formula"><input className={inputClass} value={form.formula} onChange={(event) => setForm({ ...form, formula: event.target.value })} required placeholder="income - cost" /></Field>
          ) : null}
          <div className="flex items-end gap-2">
            <Button>{editing ? "Save" : "Create"}</Button>
            {editing ? <Button type="button" tone="ghost" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</Button> : null}
          </div>
        </form>
      </Panel>
      {loading ? <Loading /> : rows.length === 0 ? <Empty title="No fields" body="Add income, cost, and a calculated revenue field." /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500"><tr>{["Order", "Label", "Key", "Type", "Formula", "Flags", ""].map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.sort_order}</td>
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.key}</td>
                  <td className="px-3 py-2">{row.field_type}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.formula || "—"}</td>
                  <td className="px-3 py-2 space-x-1">
                    {row.is_calculated ? <Badge value="submitted" /> : null}
                    {row.is_required ? <Badge value="pending" /> : null}
                    <Badge value={row.is_active ? "active" : "inactive"} />
                  </td>
                  <td className="px-3 py-2"><button className="underline" onClick={() => { setEditing(row.id); setForm({ key: row.key, label: row.label, field_type: row.field_type, is_required: row.is_required, is_active: row.is_active, sort_order: row.sort_order, is_calculated: row.is_calculated, formula: row.formula }); }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
