"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquareText, Star, Trash2, TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { deleteReview, getAdminReviews, type AdminReview } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/admin-utils";
import { Card, PageHeader, StatCard } from "./AdminUi";

const RATING_OPTIONS = ["All", "5", "4", "3", "2", "1"] as const;
const CLAMP_LENGTH = 180;

function RatingStars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className="mt-1 flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={`size-3.5 ${n <= rounded ? "text-accent-500" : "text-ink/20"}`}
          fill={n <= rounded ? "currentColor" : "none"}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

/** Staff moderation list: every guest review, with an inline delete confirmation. */
export function ReviewsModerationView() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [hotelFilter, setHotelFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState<(typeof RATING_OPTIONS)[number]>("All");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getAdminReviews()
      .then((rows) => {
        if (!cancelled) setReviews(rows);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load reviews. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hotels = useMemo(() => {
    const map = new Map<string, string>();
    for (const review of reviews) map.set(review.hotelId, review.hotelName);
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [reviews]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reviews.filter((review) => {
      const matchesQuery =
        !q || `${review.hotelName} ${review.comment}`.toLowerCase().includes(q);
      const matchesHotel = hotelFilter === "all" || review.hotelId === hotelFilter;
      const matchesRating =
        ratingFilter === "All" || Math.round(review.rating) === Number(ratingFilter);
      return matchesQuery && matchesHotel && matchesRating;
    });
  }, [reviews, query, hotelFilter, ratingFilter]);

  const average = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  }, [reviews]);

  const lowRatings = useMemo(
    () => reviews.filter((review) => review.rating <= 2).length,
    [reviews],
  );

  async function remove(id: string) {
    setBusyId(id);
    setError("");
    setNote("");
    try {
      await deleteReview(id);
      setConfirmId(null);
      setFadingIds((current) => new Set(current).add(id));
      setNote("Review deleted.");
      window.setTimeout(() => {
        setReviews((current) => current.filter((review) => review.id !== id));
        setFadingIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }, 240);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the review. Try again.");
    } finally {
      setBusyId(null);
    }
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
    <div>
      <PageHeader
        title="Reviews"
        description="Every guest review, newest first. Delete reviews that are fake or abusive."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total reviews" value={String(reviews.length)} icon={MessageSquareText} />
        <StatCard
          label="Average rating"
          value={reviews.length === 0 ? "—" : average.toFixed(1)}
          icon={Star}
          hint="out of 5"
        />
        <StatCard
          label="Low ratings (1–2★)"
          value={String(lowRatings)}
          icon={TriangleAlert}
          hint="worth a look"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search reviews"
          placeholder="Search hotel or comment"
          maxLength={100}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-border bg-surface px-3.5 py-2 text-sm outline-none focus:border-brand-500"
        />
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          Hotel
          <select
            value={hotelFilter}
            onChange={(e) => setHotelFilter(e.target.value)}
            className="max-w-[12rem] rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand-500"
          >
            <option value="all">All hotels</option>
            {hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          Rating
          <select
            value={ratingFilter}
            onChange={(e) =>
              setRatingFilter(e.target.value as (typeof RATING_OPTIONS)[number])
            }
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand-500"
          >
            {RATING_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "All" ? "All" : `${option}★`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="mb-3 text-sm font-medium text-brand-600">
          {note}
        </p>
      )}

      <Card bodyClassName="p-0">
        {loading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3, 4].map((n) => (
              <Skeleton key={n} className="h-16" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="py-14 text-center text-sm text-ink-soft">
            {reviews.length === 0 ? "No reviews yet." : "No reviews match these filters."}
          </p>
        ) : (
          <ul className="divide-y divide-border/20">
            {visible.map((review) => {
              const long = review.comment.length > CLAMP_LENGTH;
              const isOpen = expanded.has(review.id);
              const fading = fadingIds.has(review.id);
              const confirming = confirmId === review.id;
              const busy = busyId === review.id;
              return (
                <li
                  key={review.id}
                  className={`px-4 py-4 transition-opacity duration-200 motion-reduce:transition-none sm:px-5 ${
                    fading ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="min-w-0 truncate text-sm font-semibold">
                          {review.hotelName}
                        </p>
                        <span aria-hidden className="text-xs text-ink-soft">
                          ·
                        </span>
                        <time
                          dateTime={review.createdAt || undefined}
                          className="text-xs text-ink-soft"
                        >
                          {review.createdAt && Number.isFinite(Date.parse(review.createdAt))
                            ? formatTimestamp(review.createdAt)
                            : "Date unknown"}
                        </time>
                      </div>
                      <RatingStars rating={review.rating} />
                      <p
                        className={`mt-1.5 whitespace-pre-line break-words text-sm text-ink-soft ${
                          long && !isOpen ? "line-clamp-3" : ""
                        }`}
                      >
                        {review.comment || "No comment left."}
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
                    </div>

                    <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
                      {confirming ? (
                        <>
                          <p className="min-w-0 flex-1 text-xs text-ink-soft sm:max-w-[14rem]">
                            Delete this review? This cannot be undone.
                          </p>
                          <button
                            type="button"
                            onClick={() => void remove(review.id)}
                            disabled={busy}
                            className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {busy ? "Deleting…" : "Yes, delete"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            disabled={busy}
                            className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-bg disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmId(review.id);
                            setNote("");
                          }}
                          aria-label={`Delete review for ${review.hotelName}`}
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-bg hover:text-red-600"
                        >
                          <Trash2 aria-hidden className="size-4" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default ReviewsModerationView;
