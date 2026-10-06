"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api, money, monthName, Page } from "@/lib/api";
import { Button, ErrorNote, Field, inputClass, Loading, Panel } from "@/components/ui";

type Settlement = {
  id: number;
  device_name: string;
  year: number;
  month: number;
  balance: string;
  status: string;
};

function PaymentForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [settlement, setSettlement] = useState(params.get("settlement") || "");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Page<Settlement>>("settlements/?page_size=100").then((page) => {
      setSettlements(page.results.filter((item) => item.status !== "paid"));
    }).catch((err) => setError(err.message));
  }, []);

  const selected = settlements.find((item) => String(item.id) === settlement);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!proof) {
      setError("Attach a payment proof.");
      return;
    }
    const body = new FormData();
    body.set("settlement", settlement);
    body.set("amount", amount);
    body.set("paid_on", paidOn);
    body.set("method", method);
    body.set("reference_id", reference);
    body.set("proof", proof);
    setError("");
    try {
      await api("payments/", { method: "POST", body });
      router.push("/payments");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Submit payment</h1>
      {error ? <ErrorNote message={error} /> : null}
      <Panel title="Payment details">
        <div className="space-y-3">
          <Field label="Settlement">
            <select className={inputClass} value={settlement} onChange={(event) => setSettlement(event.target.value)} required>
              <option value="">Select</option>
              {settlements.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.device_name} · {monthName(item.month)} {item.year} · due {money(item.balance)}
                </option>
              ))}
            </select>
          </Field>
          {selected ? <p className="text-sm text-slate-500">Remaining balance {money(selected.balance)}. Partial payments are allowed.</p> : null}
          <Field label="Amount">
            <input className={inputClass} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </Field>
          <Field label="Date">
            <input className={inputClass} type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} required />
          </Field>
          <Field label="Method">
            <select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="mobile_banking">Mobile banking</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Transaction / reference ID">
            <input className={inputClass} value={reference} onChange={(event) => setReference(event.target.value)} required />
          </Field>
          <Field label="Proof (PDF, JPG, or PNG)">
            <input className={inputClass} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setProof(event.target.files?.[0] || null)} required />
          </Field>
          <Button>Submit for review</Button>
        </div>
      </Panel>
    </form>
  );
}

export default function NewPaymentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PaymentForm />
    </Suspense>
  );
}
