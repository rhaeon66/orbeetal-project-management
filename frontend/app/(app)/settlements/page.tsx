"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money, monthName, Page } from "@/lib/api";
import { Badge, Empty, ErrorNote, inputClass, Loading } from "@/components/ui";
import { Filters, Pager } from "@/components/pager";

type Settlement = {
  id: number;
  device_name: string;
  user_name: string;
  year: number;
  month: number;
  base_amount: string;
  percentage: string;
  company_share: string;
  amount_due: string;
  amount_paid: string;
  balance: string;
  status: string;
};

export default function SettlementsPage() {
  const [data, setData] = useState<Page<Settlement> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), search });
    if (status) params.set("status", status);
    api<Page<Settlement>>(`settlements/?${params}`).then(setData).catch((err) => setError(err.message));
  }, [page, search, status]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settlements</h1>
      {error ? <ErrorNote message={error} /> : null}
      <Filters>
        <input className={inputClass + " max-w-xs"} placeholder="Search device or user" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} />
        <select className={inputClass + " max-w-[160px]"} value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
          <option value="">All</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
      </Filters>
      {!data ? <Loading /> : data.results.length === 0 ? <Empty title="No settlements" body="A settlement is created when a monthly report is submitted." /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Period", "Device", "User", "Base", "Company share", "Due", "Paid", "Balance", "Status"].map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {data.results.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{monthName(row.month)} {row.year}</td>
                  <td className="px-3 py-2">{row.device_name}</td>
                  <td className="px-3 py-2">{row.user_name}</td>
                  <td className="px-3 py-2">{money(row.base_amount)}</td>
                  <td className="px-3 py-2">{row.percentage}% · {money(row.company_share)}</td>
                  <td className="px-3 py-2">{money(row.amount_due)}</td>
                  <td className="px-3 py-2">{money(row.amount_paid)}</td>
                  <td className="px-3 py-2">{money(row.balance)}</td>
                  <td className="px-3 py-2"><Badge value={row.status} /> {row.balance !== "0.00" ? <Link className="ml-2 underline" href={`/payments/new?settlement=${row.id}`}>Pay</Link> : null}</td>
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
