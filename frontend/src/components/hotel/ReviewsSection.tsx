"use client";

import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import type { Review } from "@/types";

type SortKey = "newest" | "highest" | "lowest";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "highest", label: "Highest rated" },
  { value: "lowest", label: "Lowest rated" },
];

const STARS = [5, 4, 3, 2, 1] as const;
const PAGE_SIZE = 5;
/** Comments longer than this get a "Read more" toggle (roughly 4 lines). */
const CLAMP_LENGTH = 220;

function timeOf(review: Review): number {
  return review.createdAt ? Date.parse(review.createdAt) : NaN;
}

/** "3 days ago", "2 months ago"; a short date when the timestamp is missing. */
function relativeDate(iso?: string): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";

  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

  const years = Math.round(months / 12);
  if (years < 5) return `${years} year${years === 1 ? "" : "s"} ago`;

  return new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Five stars with a fractional gold fill. */
function Stars({ value, className = "" }: { value: number; className?: string }) {
  const pct = (Math.max(0, Math.min(5, value)) / 5) * 100;
  const row = (filled: boolean) => (
    <span className="flex gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`size-4 shrink-0 ${filled ? "text-accent-500" : "text-ink/20"}`}
          fill={filled ? "currentColor" : "none"}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );

  return (
    <span
      role="img"
      aria-label={`${value.toFixed(1)} out of 5 stars`}
      className={`relative inline-flex ${className}`}
    >
      {row(false)}
      <span
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${pct}%` }}
      >
        {row(true)}
      </span>
    </span>
  );
}

/**
 * Google Play style "Ratings and reviews": summary + distribution bars on top,
 * then a filterable, sortable list. Only the data the backend actually exposes
 * is shown (no reviewer names, no helpful votes).
 */
export function ReviewsSection({ reviews, rating }: { reviews: Review[]; rating: number }) {
  const [filter, setFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("newest");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [barsReady, setBarsReady] = useState(false);

  // Bars grow from 0 once on mount (reduced-motion users see them instantly).
  useEffect(() => {
    const handle = window.setTimeout(() => setBarsReady(true), 60);
    return () => window.clearTimeout(handle);
  }, []);

  const average = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  }, [reviews]);

  const counts = useMemo(() => {
    const map = new Map<number, number>();
    for (const star of STARS) map.set(star, 0);
    for (const review of reviews) {
      const star = Math.round(review.rating);
      if (map.has(star)) map.set(star, (map.get(star) ?? 0) + 1);
    }
    return map;
  }, [reviews]);

  const visible = useMemo(() => {
    const list = filter === null ? reviews : reviews.filter((r) => Math.round(r.rating) === filter);
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "highest" || sort === "lowest") {
        const diff = a.rating - b.rating;
        if (diff !== 0) return sort === "highest" ? -diff : diff;
      }
      const aTime = timeOf(a);
      const bTime = timeOf(b);
      const aValid = Number.isFinite(aTime);
      const bValid = Number.isFinite(bTime);
      if (aValid && bValid && aTime !== bTime) return bTime - aTime;
      if (aValid !== bValid) return aValid ? -1 : 1;
      return 0;
    });
    return sorted;
  }, [reviews, filter, sort]);

  const page = visible.slice(0, shown);

  function toggleFilter(star: number) {
    setFilter((current) => (current === star ? null : star));
    setShown(PAGE_SIZE);
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      role="region"
      aria-label={`Ratings and reviews — ${reviews.length} guest reviews, hotel rating ${rating.toFixed(1)} out of 5`}
      className="space-y-6"
    >
      <div className="grid gap-6 sm:grid-cols-[minmax(0,180px)_1fr] sm:gap-8">
        <div className="flex flex-col items-center justify-center rounded-card border border-border bg-surface p-4 text-center shadow-sm sm:items-start sm:text-left">
          <p className="text-5xl font-semibold tracking-tight tabular-nums">
            {reviews.length === 0 ? "—" : average.toFixed(1)}
          </p>
          <Stars value={average} className="mt-2" />
          <p className="mt-2 text-xs text-ink-soft">
            {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
          </p>
        </div>

        <div className="space-y-1">
          {STARS.map((star) => {
            const count = counts.get(star) ?? 0;
            const pct = reviews.length === 0 ? 0 : (count / reviews.length) * 100;
            const active = filter === star;
            return (
              <button
                key={star}
                type="button"
                onClick={() => toggleFilter(star)}
                aria-pressed={active}
                aria-label={`${star} star${star === 1 ? "" : "s"}, ${count} ${
                  count === 1 ? "review" : "reviews"
                }${active ? ", filter active" : ""}`}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                  active ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-bg"
                }`}
              >
                <span className="w-7 shrink-0 text-xs font-medium text-ink-soft">{star}★</span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/10">
                  <span
                    className="block h-full rounded-full bg-accent-500 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                    style={{ width: barsReady ? `${pct}%` : "0%" }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {filter !== null && (
          <button
            type="button"
            onClick={() => {
              setFilter(null);
              setShown(PAGE_SIZE);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-100"
          >
            Clear filter: {filter}★ <span aria-hidden>×</span>
          </button>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-ink-soft">
          Sort
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setShown(PAGE_SIZE);
            }}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand-500"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {reviews.length === 0 ? (
        <p className="rounded-card border border-dashed border-border py-10 text-center text-sm text-ink-soft">
          No reviews yet. Reviews appear after guests finish their stay.
        </p>
      ) : page.length === 0 ? (
        <p className="rounded-card border border-dashed border-border py-10 text-center text-sm text-ink-soft">
          No {filter}★ reviews yet. Clear the filter to see all reviews.
        </p>
      ) : (
        <ul className="space-y-3">
          {page.map((review, i) => {
            const long = review.comment.length > CLAMP_LENGTH;
            const isOpen = expanded.has(review.id);
            return (
              <li
                key={review.id}
                className="anim-fade-in rounded-card border border-border bg-surface p-4 shadow-sm"
                style={{ animationDelay: `${Math.min(i, 4) * 60}ms`, animationFillMode: "backwards" }}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-100"
                  >
                    G
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold">Guest</span>
                      {review.createdAt && (
                        <time
                          dateTime={review.createdAt}
                          className="text-xs text-ink-soft"
                        >
                          {relativeDate(review.createdAt)}
                        </time>
                      )}
                    </div>
                    <div className="mt-1">
                      <Stars value={review.rating} />
                    </div>
                    {review.comment ? (
                      <>
                        <p
                          className={`mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-ink-soft ${
                            long && !isOpen ? "line-clamp-4" : ""
                          }`}
                        >
                          {review.comment}
                        </p>
                        {long && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(review.id)}
                            aria-expanded={isOpen}
                            className="mt-1 text-xs font-semibold text-brand-600 hover:underline"
                          >
                            {isOpen ? "Show less" : "Read more"}
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-ink-soft">No comment left.</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {visible.length > page.length && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            className="rounded-full border border-brand-500 px-5 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 dark:hover:bg-brand-500/10"
          >
            Show more reviews ({visible.length - page.length} left)
          </button>
        </div>
      )}
    </div>
  );
}

export default ReviewsSection;
