"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, monthName, Page, SessionUser } from "@/lib/api";
import { Badge, Button, Empty, ErrorNote, inputClass, Loading } from "@/components/ui";
import { Filters, Pager } from "@/components/pager";

type Report = {
  id: number;
  device_name: string;
  device_code: string;
  user_name: string;
  year: number;
  month: number;
  status: string;
  settlement_id: number | null;
};

export default function ReportsPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [data, setData] = useState<Page<Report> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [month, setMonth] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<SessionUser>("auth/me/").then(setMe).catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), search });
    if (status) params.set("status", status);
    if (month) params.set("month", month);
    api<Page<Report>>(`reports/?${params}`).then(setData).catch((err) => setError(err.message));
  }, [page, search, status, month]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Monthly reports</h1>
        {me?.role === "user" ? <Link href="/reports/new"><Button>New report</Button></Link> : null}
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <Filters>
        <input className={inputClass + " max-w-xs"} placeholder="Search device or user" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} />
        <select className={inputClass + " max-w-[160px]"} value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
        </select>
        <select className={inputClass + " max-w-[160px]"} value={month} onChange={(event) => { setPage(1); setMonth(event.target.value); }}>
          <option value="">All months</option>
          {Array.from({ length: 12 }, (_, index) => (
            <option key={index + 1} value={index + 1}>{monthName(index + 1)}</option>
          ))}
        </select>
      </Filters>
      {!data ? <Loading /> : data.results.length === 0 ? <Empty title="No reports" body="Submitted monthly reports will be listed here." /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Period", "Device", "User", "Status", ""].map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {data.results.map((report) => (
                <tr key={report.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{monthName(report.month)} {report.year}</td>
                  <td className="px-3 py-2">{report.device_code} · {report.device_name}</td>
                  <td className="px-3 py-2">{report.user_name}</td>
                  <td className="px-3 py-2"><Badge value={report.status} /></td>
                  <td className="px-3 py-2"><Link className="underline" href={`/reports/${report.id}`}>Open</Link></td>
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
