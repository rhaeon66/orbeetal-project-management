"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, monthName, Page } from "@/lib/api";
import { Button, ErrorNote, Field, inputClass, Loading, Panel } from "@/components/ui";

type Device = { id: number; name: string; device_code: string; status: string };
type ReportField = {
  id: number;
  key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  is_calculated: boolean;
  formula: string;
};

export default function NewReportPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [fields, setFields] = useState<ReportField[]>([]);
  const [device, setDevice] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [notes, setNotes] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api<Page<Device>>("devices/?page_size=100"), api<Page<ReportField>>("report-fields/?page_size=100")])
      .then(([devicePage, fieldPage]) => {
        setDevices(devicePage.results.filter((item) => item.status === "assigned"));
        setFields(fieldPage.results);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent, asDraft: boolean) {
    event.preventDefault();
    setError("");
    const input_values: Record<string, string | boolean> = {};
    for (const field of fields) {
      if (field.is_calculated) continue;
      const raw = values[field.key] ?? "";
      if (field.field_type === "boolean") input_values[field.key] = raw === "true";
      else if (raw !== "") input_values[field.key] = raw;
    }
    try {
      const report = await api<{ id: number }>("reports/", {
        method: "POST",
        body: JSON.stringify({ device: Number(device), year, month, notes, input_values, submit: !asDraft }),
      });
      router.push(`/reports/${report.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the report.");
    }
  }

  if (loading) return <Loading />;

  return (
    <form className="space-y-4" onSubmit={(event) => submit(event, false)}>
      <h1 className="text-2xl font-semibold">New monthly report</h1>
      {error ? <ErrorNote message={error} /> : null}
      <Panel title="Period">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Device">
            <select className={inputClass} value={device} onChange={(event) => setDevice(event.target.value)} required>
              <option value="">Select an assigned device</option>
              {devices.map((item) => (
                <option key={item.id} value={item.id}>{item.device_code} · {item.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Month">
            <select className={inputClass} value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>{monthName(index + 1)}</option>
              ))}
            </select>
          </Field>
          <Field label="Year">
            <input className={inputClass} type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} required />
          </Field>
        </div>
      </Panel>
      <Panel title="Figures">
        <div className="grid gap-3 md:grid-cols-2">
          {fields.map((field) => (
            <Field key={field.id} label={field.is_calculated ? `${field.label} (calculated)` : field.label}>
              {field.is_calculated ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{field.formula}</p>
              ) : field.field_type === "boolean" ? (
                <select className={inputClass} value={values[field.key] || "false"} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}>
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              ) : (
                <input
                  className={inputClass}
                  type={field.field_type === "date" ? "date" : field.field_type === "text" ? "text" : "number"}
                  step="0.01"
                  required={field.is_required}
                  value={values[field.key] || ""}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                />
              )}
            </Field>
          ))}
          <Field label="Notes">
            <input className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
      </Panel>
      <div className="flex gap-2">
        <Button type="submit">Submit report</Button>
        <Button type="button" tone="ghost" onClick={(event) => submit(event, true)}>Save draft</Button>
      </div>
    </form>
  );
}
