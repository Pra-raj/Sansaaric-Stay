"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Inbox,
  Plus,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth-context";
import {
  getActivityLog,
  getAdminBookings,
  getAdminHotels,
  getInboxMessages,
  getRevenueSummary,
  getTrainingDocuments,
} from "@/lib/api-client";
import {
  bookingStatusTone,
  formatCurrency,
  formatDate,
  formatRelativeTime,
  greeting,
} from "@/lib/admin-utils";
import type {
  ActivityEntry,
  AdminBooking,
  AdminHotel,
  InboxListItem,
  RevenueSummary,
  TrainingDocument,
} from "@/types";
import { Card, CardLink, PageHeader, StatCard } from "./AdminUi";
import { RevenueChart } from "./RevenueChart";

interface Data {
  revenue: RevenueSummary;
  bookings: AdminBooking[];
  hotels: AdminHotel[];
  threads: InboxListItem[];
  docs: TrainingDocument[];
  activity: ActivityEntry[];
}

const statusColors = {
  Upcoming: "bg-brand-500",
  Completed: "bg-emerald-300",
  Cancelled: "bg-red-400",
} as const;

function percentChange(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

export function AdminOverview() {
  const { user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getRevenueSummary(),
      getAdminBookings(),
      getAdminHotels(),
      getInboxMessages(),
      getTrainingDocuments(),
      getActivityLog(),
    ])
      .then(([revenue, bookings, hotels, threads, docs, activity]) => {
        if (!cancelled) setData({ revenue, bookings, hotels, threads, docs, activity });
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the dashboard. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const m = data.revenue.months;
    const last = m[m.length - 1];
    const prev = m[m.length - 2];
    const counts = { Upcoming: 0, Completed: 0, Cancelled: 0 };
    data.bookings.forEach((b) => (counts[b.status] += 1));
    return {
      revenueDelta: last && prev ? percentChange(last.revenue, prev.revenue) : null,
      bookingsDelta: last && prev ? percentChange(last.bookings, prev.bookings) : null,
      counts,
      failedDocs: data.docs.filter((d) => d.status === "failed").length,
      inactive: data.hotels.filter((h) => h.status === "Inactive").length,
      active: data.hotels.filter((h) => h.status === "Active").length,
    };
  }, [data]);

  const firstName = user?.name.split(" ")[0] ?? "there";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`${today} · here's what's happening across your properties.`}
        actions={
          <>
            <Link href="/admin/inbox">
              <Button variant="secondary">
                <Inbox aria-hidden className="size-4" /> Open inbox
              </Button>
            </Link>
            <Link href="/admin/hotels/new">
              <Button>
                <Plus aria-hidden className="size-4" /> Add hotel
              </Button>
            </Link>
          </>
        }
      />

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {!data || !stats ? (
        !error && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <Skeleton key={n} className="h-32 rounded-card" />
              ))}
            </div>
            <Skeleton className="h-80 rounded-card" />
          </div>
        )
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total revenue"
              value={formatCurrency(data.revenue.totalRevenue)}
              icon={TrendingUp}
              delta={stats.revenueDelta}
              hint="vs previous month"
            />
            <StatCard
              label="Paid bookings"
              value={String(data.revenue.totalBookings)}
              icon={CalendarCheck}
              delta={stats.bookingsDelta}
              hint="vs previous month"
            />
            <StatCard
              label="Active hotels"
              value={String(stats.active)}
              icon={Building2}
              hint={stats.inactive ? `${stats.inactive} inactive` : "All live"}
            />
            <StatCard
              label="Inbox"
              value={String(data.threads.length)}
              icon={Inbox}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card
              title="Revenue by month"
              action={<CardLink href="/admin/revenue">View report</CardLink>}
              className="lg:col-span-2"
            >
              {data.revenue.months.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-soft">No revenue yet.</p>
              ) : (
                <RevenueChart months={data.revenue.months} height={330} />
              )}
            </Card>

            <div className="space-y-6">
              <Card title="Bookings by status">
                {data.bookings.length === 0 ? (
                  <p className="text-sm text-ink-soft">No bookings yet.</p>
                ) : (
                  <>
                    <div
                      role="img"
                      aria-label="Bookings by status"
                      className="flex h-2.5 overflow-hidden rounded-full bg-bg"
                    >
                      {(Object.keys(stats.counts) as (keyof typeof statusColors)[]).map((k) => (
                        <div
                          key={k}
                          className={statusColors[k]}
                          style={{ width: `${(stats.counts[k] / data.bookings.length) * 100}%` }}
                        />
                      ))}
                    </div>
                    <ul className="mt-4 space-y-2 text-sm">
                      {(Object.keys(stats.counts) as (keyof typeof statusColors)[]).map((k) => (
                        <li key={k} className="flex items-center gap-2">
                          <span className={`size-2.5 rounded-full ${statusColors[k]}`} />
                          <span className="text-ink-soft">{k}</span>
                          <span className="ml-auto font-semibold tabular-nums">{stats.counts[k]}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>

              <Card title="Needs attention" bodyClassName="p-2">
                {(() => {
                  const items = [
                    stats.failedDocs > 0 && {
                      href: "/admin/documents",
                      text: `${stats.failedDocs} ${stats.failedDocs === 1 ? "document" : "documents"} failed to index`,
                    },
                    stats.inactive > 0 && {
                      href: "/admin/hotels",
                      text: `${stats.inactive} inactive ${stats.inactive === 1 ? "hotel" : "hotels"}`,
                    },
                  ].filter(Boolean) as { href: string; text: string }[];
                  return items.length === 0 ? (
                    <p className="flex items-center gap-2 p-3 text-sm text-ink-soft">
                      <CheckCircle2 aria-hidden className="size-4 text-emerald-600" />
                      All caught up.
                    </p>
                  ) : (
                    <ul>
                      {items.map((i) => (
                        <li key={i.href}>
                          <Link
                            href={i.href}
                            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-bg"
                          >
                            <AlertTriangle aria-hidden className="size-4 shrink-0 text-amber-600" />
                            {i.text}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </Card>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card
              title="Recent bookings"
              action={<CardLink href="/admin/bookings">View all</CardLink>}
              className="lg:col-span-2"
              bodyClassName="overflow-x-auto"
            >
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-border/20 text-xs text-ink-soft">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Guest</th>
                    <th className="px-5 py-2.5 font-medium">Stay</th>
                    <th className="px-5 py-2.5 font-medium">Total</th>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {data.bookings.slice(0, 5).map((b) => (
                    <tr key={b.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium">{b.guestName}</p>
                        <p className="text-xs text-ink-soft">{b.hotelName}</p>
                      </td>
                      <td className="px-5 py-3 text-ink-soft">{formatDate(b.checkIn)}</td>
                      <td className="px-5 py-3 tabular-nums">{formatCurrency(b.totalAmount)}</td>
                      <td className="px-5 py-3">
                        <Badge tone={bookingStatusTone(b.status)}>{b.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card
              title="Recent activity"
              action={<CardLink href="/admin/activity">View log</CardLink>}
              bodyClassName="p-2"
            >
              <ul>
                {data.activity.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex gap-3 rounded-lg px-3 py-2.5">
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        a.level === "warning" ? "bg-amber-500" : "bg-brand-500"
                      }`}
                    />
                    <div className="min-w-0 text-sm">
                      <p className="leading-snug">
                        <span className="font-semibold">{a.actor}</span> {a.action}
                        {a.target && <span className="font-medium"> {a.target}</span>}
                      </p>
                      <p className="text-xs text-ink-soft">{formatRelativeTime(a.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
