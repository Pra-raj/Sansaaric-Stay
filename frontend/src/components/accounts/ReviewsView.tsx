"use client";

import { useEffect, useState } from "react";
import { AccountSidebar } from "./AccountSidebar";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { Button } from "../ui/Button";
import { getMyBookings, getMyReviews, type MyReview } from "@/lib/api-client";
import { ReviewForm } from "../reviews/ReviewForm";
import { canReview, onlyMine } from "@/lib/review-utils";
import type { Booking } from "@/types";

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5 text-accent-500">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? "" : "opacity-25"}>
          &#9733;
        </span>
      ))}
    </div>
  );
}

export function ReviewsView() {
  const { isLoggedIn, user } = useAuth();
  const { openLogin } = useAuthModal();
  const [reviews, setReviews] = useState<MyReview[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    let alive = true;
    Promise.all([getMyReviews().catch(() => []), getMyBookings().catch(() => [])]).then(
      ([r, b]) => {
        if (!alive) return;
        setReviews(r);
        setBookings(b);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [isLoggedIn]);

  if (!isLoggedIn || !user) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl">
          &#9733;
        </div>
        <h1 className="text-2xl font-bold">Log in to view your reviews</h1>
        <Button className="mt-6" onClick={openLogin}>
          Log in
        </Button>
      </div>
    );
  }

  const mine = onlyMine(bookings, user.id);
  const myBookingIds = new Set(mine.map((b) => b.id));
  const myReviews = reviews.filter((r) => myBookingIds.has(r.bookingId));
  const toReview = mine.filter((b) => canReview(b, myReviews));
  const waiting = mine.filter(
    (b) => b.status === "Upcoming" && !canReview(b, myReviews),
  );
  const hotelOf = (bookingId: string) =>
    mine.find((b) => b.id === bookingId)?.hotelName ?? "Your stay";

  const average =
    myReviews.length > 0 ? myReviews.reduce((sum, r) => sum + r.rating, 0) / myReviews.length : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
        <AccountSidebar user={user} />
        <div>
          <h1 className="mb-4 text-2xl font-bold">My reviews</h1>

          {toReview.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-lg font-semibold">Waiting for your review</h2>
              <div className="space-y-3">
                {toReview.map((b) => (
                  <div key={b.id} className="rounded-card border border-border bg-surface p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{b.hotelName}</p>
                        <p className="text-xs text-ink-soft">
                          {b.checkIn} &#x2192; {b.checkOut}
                        </p>
                      </div>
                      {openId !== b.id && (
                        <Button onClick={() => setOpenId(b.id)}>Write a review</Button>
                      )}
                    </div>
                    {openId === b.id && (
                      <ReviewForm
                        bookingId={b.id}
                        onCancel={() => setOpenId(null)}
                        onSaved={(r) => {
                          setReviews((prev) => [r, ...prev]);
                          setOpenId(null);
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {toReview.length === 0 && waiting.length > 0 && !loading && (
            <p className="mb-6 rounded-card border border-border bg-surface p-4 text-sm text-ink-soft shadow-sm">
              You can review a stay after its check-out date. Upcoming:{" "}
              {waiting.map((b) => `${b.hotelName} (${b.checkOut})`).join(", ")}.
            </p>
          )}

          <div className="mb-6 flex items-center gap-4 rounded-card border border-border bg-surface p-5 shadow-sm">
            <span className="text-4xl font-bold">{average ? average.toFixed(1) : "—"}</span>
            <div>
              <StarRow rating={Math.round(average)} />
              <p className="mt-1 text-sm text-ink-soft">
                {myReviews.length} review{myReviews.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {loading ? (
            <p className="py-12 text-center text-sm text-ink-soft">Loading...</p>
          ) : myReviews.length === 0 ? (
            <p className="rounded-card border border-dashed border-border py-12 text-center text-sm text-ink-soft">
              You haven&apos;t written any reviews yet.
            </p>
          ) : (
            <div className="space-y-4">
              {myReviews.map((review) => (
                <div
                  key={review.id}
                  className="anim-fade-in rounded-card border border-border bg-surface p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <StarRow rating={review.rating} />
                    <span className="text-xs text-ink-soft">{hotelOf(review.bookingId)}</span>
                  </div>
                  {review.comment && (
                    <p className="mt-3 text-sm leading-relaxed">{review.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
