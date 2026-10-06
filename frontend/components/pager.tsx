"use client";

import { Page } from "@/lib/api";
import { Button } from "./ui";

export function Pager({ page, data, onPage }: { page: number; data: Page<unknown> | null; onPage: (page: number) => void }) {
  if (!data || data.count <= 20) return null;
  const pages = Math.ceil(data.count / 20);
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>
        {data.count} records · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <Button tone="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button tone="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function Filters({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap gap-2">{children}</div>;
}
