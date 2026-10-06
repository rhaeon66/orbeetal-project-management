"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, money, monthName, Page, SessionUser } from "@/lib/api";
import { Badge, Button, Empty, ErrorNote, inputClass, Loading } from "@/components/ui";
import { Filters, Pager } from "@/components/pager";

type Payment = {
  id: number;
  user_name: string;
  device_name: string;
  period_year: number;
  period_month: number;
  amount: string;
  paid_on: string;
  method: string;
  reference_id: string;
  proof_url: string | null;
  status: string;
  rejection_reason: string;
};

function periodsFromRental(startYear: number, startMonth: number) {
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
  return periods;
}

function UserPayment() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [board, setBoard] = useState<{
    device: { name: string } | null;
    amount_payable: string;
    carried_dues?: { year: number; month: number; amount: string }[];
    settlement_id: number | null;
    payment: { label: string; reason: string; can_pay: boolean; amount_due: string };
    rental_start?: { year: number; month: number } | null;
  } | null>(null);
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    api<NonNullable<typeof board>>(`workspace/?year=${year}&month=${month}`)
      .then(setBoard)
      .catch((err) => setError(err.message));
  }, [year, month]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!board?.settlement_id) {
      setError("Save this month on the dashboard before paying.");
      return;
    }
    if (!proof) {
      setError("Choose a payment proof file.");
      return;
    }
    const body = new FormData();
    body.set("settlement", String(board.settlement_id));
    body.set("amount", board.payment.amount_due);
    body.set("paid_on", new Date().toISOString().slice(0, 10));
    body.set("method", method);
    body.set("reference_id", reference);
    body.set("proof", proof);
    setError("");
    setDone("");
    try {
      await api("payments/", { method: "POST", body });
      setDone("Payment submitted. Status: Under Review");
      setReference("");
      setProof(null);
      const next = await api<NonNullable<typeof board>>(`workspace/?year=${year}&month=${month}`);
      setBoard(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
    }
  }

  const periods = board?.rental_start
    ? periodsFromRental(board.rental_start.year, board.rental_start.month)
    : [{ year, month }];
  const periodValue = `${year}-${month}`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Payment</h1>
      <div className="flex gap-2">
        <select
          className={inputClass}
          value={periodValue}
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
      {error ? <ErrorNote message={error} /> : null}
      {done ? <p className="text-sm text-emerald-700">{done}</p> : null}
      {!board ? <Loading /> : (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{board.device?.name || "No device"} · {monthName(month)} {year}</p>
          <p className="text-2xl font-semibold">{money(board.payment.amount_due || board.amount_payable)}</p>
          {board.carried_dues?.length ? (
            <ul className="space-y-1 text-sm text-slate-600">
              {board.carried_dues.map((item) => (
                <li key={`${item.year}-${item.month}`}>{monthName(item.month)} {item.year} carried due: {money(item.amount)}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-sm">Status: {board.payment.label}</p>
          {board.payment.reason ? <p className="text-sm text-rose-700">Reason: {board.payment.reason}</p> : null}
          {board.payment.can_pay ? (
            <>
              <label className="block text-sm">Payment method
                <select className={inputClass + " mt-1"} value={method} onChange={(event) => setMethod(event.target.value)}>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="mobile_banking">Mobile banking</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block text-sm">Transaction ID
                <input className={inputClass + " mt-1"} value={reference} onChange={(event) => setReference(event.target.value)} required placeholder="Enter transaction ID" />
              </label>
              <label className="block text-sm">Payment proof
                <input className={inputClass + " mt-1"} type="file" accept=".pdf,.jpg,.jpeg,.png" required onChange={(event) => setProof(event.target.files?.[0] || null)} />
              </label>
              <Button>Submit payment</Button>
            </>
          ) : null}
        </form>
      )}
    </div>
  );
}

export default function PaymentsPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [data, setData] = useState<Page<Payment> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [reason, setReason] = useState<Record<number, string>>({});

  function load(nextPage = page) {
    const params = new URLSearchParams({ page: String(nextPage), search });
    if (status) params.set("status", status);
    api<Page<Payment>>(`payments/?${params}`).then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => {
    api<SessionUser>("auth/me/").then(setMe).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (me?.role === "admin") load(page);
  }, [page, search, status, me]);

  async function review(id: number, decision: "approve" | "reject") {
    setError("");
    try {
      await api(`payments/${id}/${decision}/`, {
        method: "POST",
        body: JSON.stringify(decision === "reject" ? { rejection_reason: reason[id] || "" } : {}),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed.");
    }
  }

  if (me?.role === "user") return <UserPayment />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Payments</h1>
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <Filters>
        <input className={inputClass + " max-w-xs"} placeholder="Search reference, device, user" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} />
        <select className={inputClass + " max-w-[160px]"} value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </Filters>
      {!data ? <Loading /> : data.results.length === 0 ? <Empty title="No payments" body="Payment submissions and reviews show up here." /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Period", "Device", "User", "Amount", "Method", "Reference", "Proof", "Status", ""].map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {data.results.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">{monthName(row.period_month)} {row.period_year}<div className="text-xs text-slate-500">{row.paid_on}</div></td>
                  <td className="px-3 py-2">{row.device_name}</td>
                  <td className="px-3 py-2">{row.user_name}</td>
                  <td className="px-3 py-2">{money(row.amount)}</td>
                  <td className="px-3 py-2 capitalize">{row.method.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2">{row.reference_id}</td>
                  <td className="px-3 py-2">{row.proof_url ? <a className="underline" href={row.proof_url} target="_blank">View</a> : "—"}</td>
                  <td className="px-3 py-2">
                    <Badge value={row.status} />
                    {row.rejection_reason ? <p className="mt-1 max-w-xs text-xs text-rose-700">{row.rejection_reason}</p> : null}
                  </td>
                  <td className="px-3 py-2">
                    {me?.role === "admin" && row.status === "pending" ? (
                      <div className="space-y-2">
                        <Button onClick={() => review(row.id, "approve")}>Approve</Button>
                        <input className={inputClass} placeholder="Rejection reason" value={reason[row.id] || ""} onChange={(event) => setReason({ ...reason, [row.id]: event.target.value })} />
                        <Button tone="danger" onClick={() => review(row.id, "reject")}>Reject</Button>
                      </div>
                    ) : null}
                  </td>
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
