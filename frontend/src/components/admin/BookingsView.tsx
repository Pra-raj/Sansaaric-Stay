"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { getAdminBookings } from "@/lib/api-client";
import {
  bookingStatusTone,
  formatCurrency,
  formatDate,
  formatTimestamp,
} from "@/lib/admin-utils";
import type { AdminBooking } from "@/types";

const filters = ["All", "Upcoming", "Completed", "Cancelled"] as const;
type Filter = (typeof filters)[number];

export function BookingsView() {
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdminBookings()
      .then((r) => {
        if (!cancelled) setBookings(r);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load bookings. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings.filter(
      (b) =>
        (filter === "All" || b.status === filter) &&
        (!q || `${b.guestName} ${b.hotelName} ${b.id}`.toLowerCase().includes(q)),
    );
  }, [bookings, filter, query]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Bookings</h1>
      <p className="mb-4 text-sm text-ink-soft">
        All guest bookings across your properties.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                filter === f ? "bg-brand-50 text-brand-600" : "text-ink-soft hover:bg-bg"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Search bookings"
          placeholder="Search guest, hotel or booking ID"
          maxLength={100}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-border bg-surface px-3.5 py-2 text-sm outline-none focus:border-brand-500 sm:ml-auto"
        />
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-12" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/20 py-12 text-center text-sm text-ink-soft">
          No bookings match.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border/20 bg-surface shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border/20 text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-semibold">Booking</th>
                <th className="px-4 py-3 font-semibold">Guest</th>
                <th className="px-4 py-3 font-semibold">Stay</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {visible.map((b) => (
                <Fragment key={b.id}>
                  <tr
                    onClick={() => setOpenId(openId === b.id ? null : b.id)}
                    className="cursor-pointer hover:bg-bg"
                  >
                    <td className="px-4 py-3">
                      <button
                        aria-expanded={openId === b.id}
                        className="text-left font-medium"
                      >
                        {b.hotelName}
                      </button>
                      <p className="text-xs text-ink-soft">{b.id}</p>
                    </td>
                    <td className="px-4 py-3">{b.guestName}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {formatDate(b.checkIn)} → {formatDate(b.checkOut)}
                    </td>
                    <td className="px-4 py-3">{formatCurrency(b.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={bookingStatusTone(b.status)}>{b.status}</Badge>
                    </td>
                  </tr>
                  {openId === b.id && (
                    <tr className="bg-bg">
                      <td colSpan={5} className="px-4 py-3 text-sm text-ink-soft">
                        <p>
                          {b.guestName} &middot; {b.guestEmail}
                        </p>
                        <p>
                          {b.location} &middot; {b.guests}{" "}
                          {b.guests === 1 ? "guest" : "guests"} &middot; booked{" "}
                          {formatTimestamp(b.bookedAt)}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
