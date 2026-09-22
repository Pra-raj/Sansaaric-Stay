"use client";

import { useState } from "react";
import { AccountSidebar } from "./AccountSidebar";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { Button } from "../ui/Button";
import { dummyReviews } from "@/lib/placeholder-data";
import type { Review } from "@/types";

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
  const [reviews] = useState<Review[]>(dummyReviews);

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

  const average =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
        <AccountSidebar user={user} />
        <div>
          <h1 className="mb-4 text-2xl font-bold">My reviews</h1>

          <div className="mb-6 flex items-center gap-4 rounded-card border border-border/10 bg-surface p-5">
            <span className="text-4xl font-bold">
              {average ? average.toFixed(1) : "—"}
            </span>
            <div>
              <StarRow rating={Math.round(average)} />
              <p className="mt-1 text-sm text-ink-soft">
                {reviews.length} review{reviews.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {reviews.length === 0 ? (
            <p className="rounded-card border border-dashed border-border/10 py-12 text-center text-sm text-ink-soft">
              You haven&apos;t written any reviews yet.
            </p>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-card border border-border/10 bg-surface p-5"
                >
                  <div className="flex items-center justify-between">
                    <StarRow rating={review.rating} />
                    <span className="text-xs text-ink-soft">
                      {review.id.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed">
                    {review.comment}
                  </p>
                  <p className="mt-2 text-xs text-ink-soft">
                    Reviewed by {review.authorName}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
