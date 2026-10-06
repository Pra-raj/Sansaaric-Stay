"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { getRevenueSummary } from "@/lib/api-client";
import { formatCurrency, formatMonth } from "@/lib/admin-utils";
import { RevenueChart } from "./RevenueChart";
import type { RevenueSummary } from "@/types";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border/20 bg-surface shadow-sm p-4">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-sm text-ink-soft">{label}</p>
    </div>
  );
}

export function RevenueView() {
  const [data, setData] = useState<RevenueSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getRevenueSummary()
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load revenue. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Revenue</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Based on upcoming and completed bookings. Cancelled bookings are left out.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-20 rounded-card" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Total revenue" value={formatCurrency(data.totalRevenue)} />
            <Stat label="Paid bookings" value={String(data.totalBookings)} />
            <Stat label="Average booking" value={formatCurrency(data.averageBooking)} />
            <Stat label="Cancelled" value={String(data.cancelledBookings)} />
          </div>

          <section className="mt-6 rounded-card border border-border/20 bg-surface shadow-sm p-4">
            <h2 className="mb-3 font-semibold">Revenue by month</h2>
            {data.months.length === 0 ? (
              <p className="text-sm text-ink-soft">No revenue yet.</p>
            ) : (
              <>
                <RevenueChart months={data.months} />
                <table className="sr-only">
                  <caption>Revenue by month</caption>
                  <tbody>
                    {data.months.map((m) => (
                      <tr key={m.month}>
                        <td>{formatMonth(m.month)}</td>
                        <td>{formatCurrency(m.revenue)}</td>
                        <td>{m.bookings} bookings</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
