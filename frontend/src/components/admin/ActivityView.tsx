"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarCheck,
  Download,
  FileText,
  Inbox,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { getActivityLog } from "@/lib/api-client";
import { csvCell } from "@/lib/admin-security";
import {
  activityCategoryLabels,
  dayLabel,
  formatTimestamp,
} from "@/lib/admin-utils";
import type { ActivityCategory, ActivityEntry } from "@/types";
import { Card, PageHeader } from "./AdminUi";

const PAGE_SIZE = 25;
const filters: ("all" | ActivityCategory)[] = ["all", "hotel", "booking", "inbox", "document", "security"];

const categoryIcon = {
  hotel: Building2,
  booking: CalendarCheck,
  inbox: Inbox,
  document: FileText,
  security: ShieldCheck,
} as const;

export function ActivityView() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    getActivityLog()
      .then((r) => {
        if (!cancelled) setEntries(r);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the activity log. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (filter === "all" || e.category === filter) &&
        (!q || `${e.actor} ${e.action} ${e.target}`.toLowerCase().includes(q)),
    );
  }, [entries, filter, query]);

  const shown = filtered.slice(0, limit);

  function exportCsv() {
    const rows = [
      ["Time", "Actor", "Email", "Category", "Action", "Target", "Level"],
      ...filtered.map((e) => [e.at, e.actor, e.actorEmail, e.category, e.action, e.target, e.level]),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Activity log"
        description="A record of who changed what in the admin area."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0} className="disabled:opacity-50">
            <Download aria-hidden className="size-4" /> Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setLimit(PAGE_SIZE);
              }}
              aria-pressed={filter === f}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                filter === f ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-surface"
              }`}
            >
              {f === "all" ? "All" : activityCategoryLabels[f]}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Search activity"
          placeholder="Search by person, action or item"
          maxLength={100}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE_SIZE);
          }}
          className="w-full max-w-xs rounded-lg border border-border bg-surface px-3.5 py-2 text-sm outline-none focus:border-brand-500 sm:ml-auto"
        />
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <Card bodyClassName="p-0">
        {loading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3, 4].map((n) => (
              <Skeleton key={n} className="h-12" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="py-14 text-center text-sm text-ink-soft">No activity matches.</p>
        ) : (
          <ul>
            {shown.map((e, i) => {
              const Icon = e.level === "warning" ? ShieldAlert : categoryIcon[e.category];
              const day = dayLabel(e.at);
              const newDay = i === 0 || day !== dayLabel(shown[i - 1].at);
              return (
                <Fragment key={e.id}>
                  {newDay && (
                    <li className="border-y border-border/20 bg-bg px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft first:border-t-0">
                      {day}
                    </li>
                  )}
                  <li className="flex items-center gap-4 border-b border-border/20 px-5 py-3.5 last:border-b-0">
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                        e.level === "warning" ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-600"
                      }`}
                    >
                      <Icon aria-hidden className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="leading-snug">
                        <span className="font-semibold">{e.actor}</span> {e.action}
                        {e.target && <span className="font-medium"> {e.target}</span>}
                      </p>
                      <p className="text-xs text-ink-soft">{activityCategoryLabels[e.category]}</p>
                    </div>
                    {e.level === "warning" && <Badge tone="warning">Warning</Badge>}
                    <time dateTime={e.at} className="shrink-0 text-xs text-ink-soft">
                      {formatTimestamp(e.at)}
                    </time>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}
      </Card>

      {filtered.length > shown.length && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Show more ({filtered.length - shown.length} left)
          </Button>
        </div>
      )}
    </div>
  );
}
