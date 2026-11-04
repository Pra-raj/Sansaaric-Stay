"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { createReview, type MyReview } from "@/lib/api-client";

export function ReviewForm({
  bookingId,
  onSaved,
  onCancel,
}: {
  bookingId: string;
  onSaved: (r: MyReview) => void;
  onCancel?: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setError("Please choose a star rating.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      onSaved(await createReview({ bookingId, rating, comment: comment.trim() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review. Please try again.");
      setBusy(false);
    }
  }

  const shown = hover || rating;
  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => {
              setRating(n);
              setError("");
            }}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className={`text-3xl leading-none transition-transform hover:scale-110 motion-reduce:transition-none ${
              n <= shown ? "text-accent-500" : "text-ink/20"
            }`}
          >
            &#9733;
          </button>
        ))}
        {rating > 0 && <span className="ml-2 text-sm text-ink-soft">{rating}/5</span>}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="How was your stay? (optional)"
        className="w-full rounded-lg border border-border bg-surface p-3 text-sm outline-none focus:border-brand-500"
      />
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Submit review"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
