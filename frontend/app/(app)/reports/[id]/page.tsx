"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, money, monthName } from "@/lib/api";
import { Badge, Button, ErrorNote, Loading, Panel } from "@/components/ui";

type ValueRow = {
  key: string;
  label: string;
  field_type: string;
  is_calculated: boolean;
  formula: string;
  decimal_value: string | null;
  text_value: string;
  date_value: string | null;
  bool_value: boolean | null;
  sort_order: number;
};

type Report = {
  id: number;
  device_name: string;
  device_code: string;
  user_name: string;
  year: number;
  month: number;
  status: string;
  notes: string;
  values: ValueRow[];
  settlement_id: number | null;
};

type Settlement = {
  id: number;
  base_field_key: string;
  base_amount: string;
  percentage: string;
  company_share: string;
  amount_due: string;
  amount_paid: string;
  balance: string;
  status: string;
};

function display(row: ValueRow) {
  if (row.field_type === "currency" || row.field_type === "number") return money(row.decimal_value);
  if (row.field_type === "percentage") return `${row.decimal_value ?? "0"}%`;
  if (row.field_type === "date") return row.date_value || "—";
  if (row.field_type === "boolean") return row.bool_value ? "Yes" : "No";
  return row.text_value || "—";
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Report>(`reports/${params.id}/`)
      .then(async (item) => {
        setReport(item);
        if (item.settlement_id) {
          setSettlement(await api<Settlement>(`settlements/${item.settlement_id}/`));
        }
      })
      .catch((err) => setError(err.message));
  }, [params.id]);

  async function submit() {
    setError("");
    try {
      const item = await api<Report>(`reports/${params.id}/submit/`, { method: "POST" });
      setReport(item);
      if (item.settlement_id) setSettlement(await api<Settlement>(`settlements/${item.settlement_id}/`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed.");
    }
  }

  if (error && !report) return <ErrorNote message={error} />;
  if (!report) return <Loading />;
  const rows = [...report.values].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{report.user_name}</h1>
          <p className="text-slate-500">{report.device_name} · {monthName(report.month)} {report.year}</p>
        </div>
        <Badge value={report.status} />
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <Panel title="Report values">
        <dl className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.key}>
              <dt className="text-sm text-slate-500">{row.label}{row.is_calculated ? ` = ${row.formula}` : ""}</dt>
              <dd className="text-lg font-medium">{display(row)}</dd>
            </div>
          ))}
        </dl>
        {report.notes ? <p className="mt-4 text-sm text-slate-600">{report.notes}</p> : null}
        {report.status === "draft" ? <div className="mt-4"><Button onClick={submit}>Submit and generate settlement</Button></div> : null}
      </Panel>
      {settlement ? (
        <Panel title="Settlement" action={<Link className="text-sm underline" href={`/payments/new?settlement=${settlement.id}`}>Pay</Link>}>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div><dt className="text-sm text-slate-500">{settlement.base_field_key}</dt><dd className="text-lg font-medium">{money(settlement.base_amount)}</dd></div>
            <div><dt className="text-sm text-slate-500">Company share</dt><dd className="text-lg font-medium">{settlement.percentage}% · {money(settlement.company_share)}</dd></div>
            <div><dt className="text-sm text-slate-500">Balance</dt><dd className="text-lg font-medium">{money(settlement.balance)} <Badge value={settlement.status} /></dd></div>
          </dl>
        </Panel>
      ) : null}
    </div>
  );
}
