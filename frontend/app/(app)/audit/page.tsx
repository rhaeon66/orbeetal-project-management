"use client";

import { Fragment, useEffect, useState } from "react";
import { api, Page } from "@/lib/api";
import { Empty, ErrorNote, inputClass, Loading } from "@/components/ui";
import { Filters, Pager } from "@/components/pager";

type Audit = {
  id: number;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  before: unknown;
  after: unknown;
};

export default function AuditPage() {
  const [data, setData] = useState<Page<Audit> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), search });
    api<Page<Audit>>(`audit-logs/?${params}`).then(setData).catch((err) => setError(err.message));
  }, [page, search]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      {error ? <ErrorNote message={error} /> : null}
      <Filters>
        <input className={inputClass + " max-w-xs"} placeholder="Search action or entity" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} />
      </Filters>
      {!data ? <Loading /> : data.results.length === 0 ? <Empty title="No audit events" body="Assignments, reports, rules, and payment reviews are recorded here." /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500"><tr>{["When", "Actor", "Action", "Entity", ""].map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr></thead>
            <tbody>
              {data.results.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-2">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">{row.actor_name || "—"}</td>
                    <td className="px-3 py-2">{row.action}</td>
                    <td className="px-3 py-2">{row.entity_type} #{row.entity_id}</td>
                    <td className="px-3 py-2"><button className="underline" onClick={() => setOpen(open === row.id ? null : row.id)}>Details</button></td>
                  </tr>
                  {open === row.id ? (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={5} className="px-3 py-2">
                        <pre className="overflow-x-auto text-xs">{JSON.stringify({ before: row.before, after: row.after }, null, 2)}</pre>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} data={data} onPage={setPage} />
    </div>
  );
}
