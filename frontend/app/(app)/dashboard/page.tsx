"use client";

import { useEffect, useState } from "react";
import { api, money, SessionUser } from "@/lib/api";
import { UserBoard } from "@/components/user-board";
import { Loading, Stat } from "@/components/ui";

type AdminDash = {
  role: "admin";
  total_users: number;
  total_devices: number;
  active_assignments: number;
  revenue: string;
  company_revenue: string;
  pending_reports: number;
  pending_payments: number;
};

type UserDash = {
  role: "user";
  assigned_devices: number;
  monthly_revenue: string;
  amount_due: string;
  pending_payments: number;
};

export default function DashboardPage() {
  const [data, setData] = useState<AdminDash | UserDash | null>(null);
  const [error, setError] = useState("");
  const [me, setMe] = useState<SessionUser | null>(null);

  useEffect(() => {
    api<AdminDash | UserDash>("dashboard/")
      .then(setData)
      .catch((err) => setError(err.message));
    api<SessionUser>("auth/me/").then(setMe).catch(() => undefined);
  }, []);

  if (me?.role === "user") return <UserBoard />;
  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!data) return <Loading />;

  if (data.role === "admin") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Admin dashboard</h1>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Users" value={data.total_users} />
          <Stat label="Devices" value={data.total_devices} />
          <Stat label="Active assignments" value={data.active_assignments} />
          <Stat label="Pending reports" value={data.pending_reports} />
          <Stat label="Revenue" value={money(data.revenue)} />
          <Stat label="Company revenue" value={money(data.company_revenue)} />
          <Stat label="Pending payments" value={data.pending_payments} />
        </div>
      </div>
    );
  }

  return <UserBoard />;
}
