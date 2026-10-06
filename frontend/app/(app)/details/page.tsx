"use client";

import { useEffect, useState } from "react";
import { api, Page } from "@/lib/api";
import { Empty, ErrorNote, Loading } from "@/components/ui";

type Assignment = {
  id: number;
  device_name: string;
  device_code: string;
  started_at: string;
  ended_at: string | null;
};

export default function DetailsPage() {
  const [rows, setRows] = useState<Assignment[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Page<Assignment>>("assignments/?page_size=100")
      .then((page) => setRows(page.results))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorNote message={error} />;
  if (!rows) return <Loading />;
  if (rows.length === 0) return <Empty title="No device" body="You have not borrowed a device yet." />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Details</h1>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {rows.map((row) => (
          <div key={row.id} className="border-t border-slate-100 px-4 py-3 first:border-t-0">
            <p className="font-medium">{row.device_name}</p>
            <p className="text-sm text-slate-500">{row.device_code}</p>
            <p className="mt-1 text-sm">Borrowed {new Date(row.started_at).toLocaleDateString()}</p>
            <p className="text-sm text-slate-600">
              {row.ended_at ? `Returned ${new Date(row.ended_at).toLocaleDateString()}` : "Still borrowed"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
