"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, Page } from "@/lib/api";
import { Badge, Button, Empty, ErrorNote, Field, inputClass, Loading, Panel } from "@/components/ui";

type ReportField = { id: number; key: string; label: string; field_type: string };
type Rule = {
  id: number;
  name: string;
  percentage: string;
  base_field: number;
  base_field_label: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
};

const blank = { name: "", percentage: "10.00", base_field: "", effective_from: "2020-01-01", effective_to: "", is_active: true };

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [fields, setFields] = useState<ReportField[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    Promise.all([
      api<Page<Rule>>("commission-rules/?page_size=100"),
      api<Page<ReportField>>("report-fields/?page_size=100"),
    ]).then(([rulePage, fieldPage]) => {
      setRules(rulePage.results);
      setFields(fieldPage.results.filter((field) => ["currency", "number", "percentage"].includes(field.field_type)));
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const payload = {
      name: form.name,
      percentage: form.percentage,
      base_field: Number(form.base_field),
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      is_active: form.is_active,
    };
    try {
      if (editing) await api(`commission-rules/${editing}/`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api("commission-rules/", { method: "POST", body: JSON.stringify(payload) });
      setForm(blank);
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Commission rules</h1>
      <p className="text-sm text-slate-500">The percentage is stored on each settlement when the report is submitted.</p>
      {error ? <ErrorNote message={error} /> : null}
      <Panel title={editing ? "Edit rule" : "Add rule"}>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
          <Field label="Name"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
          <Field label="Percentage"><input className={inputClass} type="number" min="0" max="100" step="0.01" value={form.percentage} onChange={(event) => setForm({ ...form, percentage: event.target.value })} required /></Field>
          <Field label="Base field">
            <select className={inputClass} value={form.base_field} onChange={(event) => setForm({ ...form, base_field: event.target.value })} required>
              <option value="">Select</option>
              {fields.map((field) => <option key={field.id} value={field.id}>{field.label} ({field.key})</option>)}
            </select>
          </Field>
          <Field label="Effective from"><input className={inputClass} type="date" value={form.effective_from} onChange={(event) => setForm({ ...form, effective_from: event.target.value })} required /></Field>
          <Field label="Effective to"><input className={inputClass} type="date" value={form.effective_to} onChange={(event) => setForm({ ...form, effective_to: event.target.value })} /></Field>
          <Field label="Active">
            <select className={inputClass} value={String(form.is_active)} onChange={(event) => setForm({ ...form, is_active: event.target.value === "true" })}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </Field>
          <div className="flex items-end"><Button>{editing ? "Save" : "Create"}</Button></div>
        </form>
      </Panel>
      {loading ? <Loading /> : rules.length === 0 ? <Empty title="No rules" body="Add a company percentage before users submit reports." /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500"><tr>{["Name", "Percentage", "Base", "From", "To", "Status", ""].map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr></thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{rule.name}</td>
                  <td className="px-3 py-2">{rule.percentage}%</td>
                  <td className="px-3 py-2">{rule.base_field_label}</td>
                  <td className="px-3 py-2">{rule.effective_from}</td>
                  <td className="px-3 py-2">{rule.effective_to || "Open"}</td>
                  <td className="px-3 py-2"><Badge value={rule.is_active ? "active" : "inactive"} /></td>
                  <td className="px-3 py-2"><button className="underline" onClick={() => { setEditing(rule.id); setForm({ name: rule.name, percentage: rule.percentage, base_field: String(rule.base_field), effective_from: rule.effective_from, effective_to: rule.effective_to || "", is_active: rule.is_active }); }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
