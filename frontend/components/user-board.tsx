"use client";

import { useEffect, useState } from "react";
import { api, money, monthName } from "@/lib/api";
import { ErrorNote, Loading } from "@/components/ui";

type Line = { description: string; quantity: string; amount: string };

type DeviceOption = { id: number; name: string; device_code: string; brand?: string; model?: string };

type Workspace = {
  devices: DeviceOption[];
  device: DeviceOption | null;
  year: number;
  month: number;
  costs: Line[];
  incomes: Line[];
  company_percentage: string | null;
  this_month_due: string;
  carried_dues: { year: number; month: number; amount: string }[];
  carried_total: string;
  month_passed: boolean;
  locked: boolean;
  amount_payable: string;
  rental_start: { year: number; month: number } | null;
  payment: { code: string; label: string; reason: string; can_pay: boolean; amount_due: string };
};

function periodsFrom(startYear: number, startMonth: number) {
  const now = new Date();
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1;
  const periods: { year: number; month: number }[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    periods.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return periods.length ? periods : [{ year: endYear, month: endMonth }];
}

const emptyLine = (): Line => ({ description: "", quantity: "", amount: "" });

function lineTotal(row: Line) {
  return Number(row.amount || 0);
}

function sumLines(rows: Line[]) {
  return rows.reduce((total, row) => total + lineTotal(row), 0);
}

function asLines(rows: Array<Line & { amount?: string }> | undefined): Line[] {
  if (!rows?.length) return [emptyLine(), emptyLine(), emptyLine()];
  return rows.map((row) => ({
    description: row.description,
    quantity: String(row.quantity ?? ""),
    amount: String(row.amount ?? ""),
  }));
}

export function UserBoard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [board, setBoard] = useState<Workspace | null>(null);
  const [costs, setCosts] = useState<Line[]>([emptyLine(), emptyLine(), emptyLine()]);
  const [incomes, setIncomes] = useState<Line[]>([emptyLine(), emptyLine(), emptyLine()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function load(nextYear = year, nextMonth = month, nextDevice = deviceId) {
    const params = new URLSearchParams({ year: String(nextYear), month: String(nextMonth) });
    if (nextDevice) params.set("device", String(nextDevice));
    api<Workspace>(`workspace/?${params}`)
      .then((data) => {
        setBoard(data);
        setCosts(asLines(data.costs));
        setIncomes(asLines(data.incomes));
        if (data.device) setDeviceId(data.device.id);
        setError("");
      })
      .catch((err) => {
        if (nextDevice) setDeviceId(null);
        else setError(err.message);
      });
  }

  useEffect(() => {
    load(year, month, deviceId);
  }, [year, month, deviceId]);

  async function save(nextCosts = costs, nextIncomes = incomes) {
    if (!board?.device || board.locked) return;
    setSaving(true);
    setError("");
    try {
      const data = await api<Workspace>("workspace/", {
        method: "PUT",
        body: JSON.stringify({
          device: board.device.id,
          year,
          month,
          costs: nextCosts.filter((row) => row.description),
          incomes: nextIncomes.filter((row) => row.description),
        }),
      });
      setBoard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this month.");
    } finally {
      setSaving(false);
    }
  }

  if (!board) return error ? <ErrorNote message={error} /> : <Loading />;

  const totalCost = sumLines(costs);
  const totalIncome = sumLines(incomes);
  const revenue = totalIncome - totalCost;
  const thisShare = board.month_passed ? Number(board.this_month_due || 0) : (Math.max(revenue, 0) * (Number(board.company_percentage) || 0)) / 100;
  const carried = board.month_passed ? 0 : Number(board.carried_total || 0);
  const payable = thisShare + carried;
  const periods = board.rental_start
    ? periodsFrom(board.rental_start.year, board.rental_start.month)
    : [{ year, month }];

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-20 place-items-center rounded-xl bg-slate-50 text-slate-400">
            <PrinterIcon />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Borrowed device</p>
            <h1 className="text-2xl font-semibold text-slate-900">{board.device?.name || "No device"}</h1>
            <p className="text-sm text-slate-500">
              Device ID: {board.device?.device_code || "—"}
              <span className="mx-2 text-slate-300">·</span>
              Brand: {board.device?.brand || "—"}
              <span className="mx-2 text-slate-300">·</span>
              Model: {board.device?.model || "—"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={`${year}-${month}`}
            onChange={(event) => {
              const [nextYear, nextMonth] = event.target.value.split("-").map(Number);
              setYear(nextYear);
              setMonth(nextMonth);
            }}
          >
            {periods.map((period) => (
              <option key={`${period.year}-${period.month}`} value={`${period.year}-${period.month}`}>
                {monthName(period.month)} {period.year}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? <ErrorNote message={error} /> : null}
      {board.month_passed ? <ErrorNote message="This month has passed, so its costs and income can no longer be edited." /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="rose" label="Total Cost" value={money(totalCost)} icon="cost" />
        <Stat tone="emerald" label="Total Income" value={money(totalIncome)} icon="income" />
        <Stat tone="sky" label="Revenue" value={money(revenue)} icon="revenue" />
        <Stat tone="amber" label="Payable to Company" value={money(payable)} icon="pay" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Ledger
          title="Costs"
          hint="Add all expenses related to the device for this month."
          tone="rose"
          addLabel="Add expense"
          rows={costs}
          locked={board.locked}
          totalLabel="Total Cost"
          total={money(totalCost)}
          onChange={(rows) => { setCosts(rows); }}
          onCommit={(rows) => save(rows, incomes)}
        />
        <Ledger
          title="Income"
          hint="Add all income generated from the device for this month."
          tone="emerald"
          addLabel="Add income"
          rows={incomes}
          locked={board.locked}
          totalLabel="Total Income"
          total={money(totalIncome)}
          onChange={setIncomes}
          onCommit={(rows) => save(costs, rows)}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-500"><span className="text-sky-500">↗</span> Revenue</p>
        <p className="mt-2 text-3xl font-semibold">{money(revenue)}</p>
        <p className="mt-2 text-sm text-slate-500">Total Income ({money(totalIncome)}) − Total Cost ({money(totalCost)})</p>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "rose" | "emerald" | "sky" | "amber"; icon: string }) {
  const styles = {
    rose: "bg-rose-50 text-rose-500",
    emerald: "bg-emerald-50 text-emerald-500",
    sky: "bg-sky-50 text-sky-500",
    amber: "bg-amber-50 text-amber-500",
  }[tone];
  return (
    <div className={`rounded-2xl border border-white p-4 shadow-sm ${styles}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Ledger({
  title,
  hint,
  tone,
  addLabel,
  rows,
  locked,
  totalLabel,
  total,
  onChange,
  onCommit,
}: {
  title: string;
  hint: string;
  tone: "rose" | "emerald";
  addLabel: string;
  rows: Line[];
  locked: boolean;
  totalLabel: string;
  total: string;
  onChange: (rows: Line[]) => void;
  onCommit: (rows: Line[]) => void;
}) {
  const footer = tone === "rose" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700";
  const add = tone === "rose" ? "text-rose-500" : "text-emerald-600";
  const [pending, setPending] = useState<number | null>(null);

  function update(index: number, key: keyof Line, value: string) {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-slate-400">{hint}</p>
        </div>
        {locked ? null : (
          <button type="button" className={`text-sm font-medium ${add}`} onClick={() => onChange([...rows, emptyLine()])}>
            + {addLabel}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              {["#", "Description", "Qty", "Total (৳)", ""].map((heading) => (
                <th key={heading} className="px-2 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="px-2 py-1.5 text-slate-400">{index + 1}</td>
                <td className="px-2 py-1.5">
                  <input className="w-full rounded-lg border border-slate-200 px-2 py-1.5" value={row.description} disabled={locked} onChange={(event) => update(index, "description", event.target.value)} onBlur={(event) => onCommit(rows.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} />
                </td>
                <td className="px-2 py-1.5">
                  <input className="w-16 rounded-lg border border-slate-200 px-2 py-1.5" type="number" min="0" step="1" value={row.quantity} disabled={locked} onChange={(event) => update(index, "quantity", event.target.value)} onBlur={(event) => onCommit(rows.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} />
                </td>
                <td className="px-2 py-1.5">
                  <input className="w-28 rounded-lg border border-slate-200 px-2 py-1.5" type="number" min="0" step="0.01" value={row.amount} disabled={locked} onChange={(event) => update(index, "amount", event.target.value)} onBlur={(event) => onCommit(rows.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} />
                </td>
                <td className="px-2 py-1.5">
                  {locked ? null : (
                    <button type="button" className="text-rose-400" onClick={() => setPending(index)} aria-label="Remove">
                      ⌫
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold ${footer}`}>
        <span>{totalLabel}</span>
        <span>{total}</span>
      </div>
      {pending === null ? null : (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="confirm-delete-title" className="text-lg font-semibold">Remove this {title === "Costs" ? "cost" : "income"}?</h3>
            <p className="mt-1 text-sm text-slate-500">
              {rows[pending]?.description ? `"${rows[pending].description}" will be removed from this month.` : "This row will be removed from this month."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => setPending(null)}>Cancel</button>
              <button
                type="button"
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white"
                onClick={() => {
                  const next = rows.filter((_, rowIndex) => rowIndex !== pending);
                  onChange(next);
                  onCommit(next);
                  setPending(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PrinterIcon() {
  return (
    <svg width="42" height="32" viewBox="0 0 42 32" fill="none" aria-hidden="true">
      <rect x="8" y="2" width="26" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="10" width="34" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12" y="20" width="18" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
