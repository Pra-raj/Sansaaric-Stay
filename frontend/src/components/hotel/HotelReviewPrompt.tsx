"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { getMyBookings, getMyReviews, type MyReview } from "@/lib/api-client";
import { canReview, onlyMine } from "@/lib/review-utils";
import { Button } from "../ui/Button";
import { ReviewForm } from "../reviews/ReviewForm";
import type { Booking } from "@/types";

/** "Write a review" box on the hotel page. Shown only to guests with a finished stay here. */
export function HotelReviewPrompt({ hotelName }: { hotelName: string }) {
  const { isLoggedIn, user } = useAuth();
  const { openLogin } = useAuthModal();
  const router = useRouter();
  const [eligible, setEligible] = useState<Booking[] | null>(null);
  const [hasUpcoming, setHasUpcoming] = useState(false);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || !user) return;
    let alive = true;
    Promise.all([getMyBookings().catch(() => []), getMyReviews().catch((): MyReview[] => [])]).then(
      ([bookings, reviews]) => {
        if (!alive) return;
        const here = onlyMine(bookings, user.id).filter((b) => b.hotelName === hotelName);
        setEligible(here.filter((b) => canReview(b, reviews)));
        setHasUpcoming(here.some((b) => b.status === "Upcoming" && !canReview(b, reviews)));
      },
    );
    return () => {
      alive = false;
    };
  }, [isLoggedIn, user, hotelName]);

  const box = "mb-4 rounded-card border border-border bg-surface p-4 shadow-sm";

  if (!isLoggedIn) {
    return (
      <div className={`${box} flex items-center justify-between gap-3`}>
        <p className="text-sm text-ink-soft">Stayed here? Log in to write a review.</p>
        <Button variant="secondary" onClick={openLogin}>
          Log in
        </Button>
      </div>
    );
  }
  if (done) return <div className={`${box} text-sm`}>Thanks! Your review was posted.</div>;
  if (eligible === null) return null;
  if (eligible.length === 0) {
    return (
      <p className={`${box} text-sm text-ink-soft`}>
        {hasUpcoming
          ? "You can review this stay after your check-out date."
          : "Reviews are open to guests after their stay. "}
        {!hasUpcoming && (
          <Link href="/account/reviews" className="font-semibold text-brand-600 hover:underline">
            My reviews
          </Link>
        )}
      </p>
    );
  }
  const booking = eligible[0];
  return (
    <div className={box}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          How was your stay ({booking.checkIn} → {booking.checkOut})?
        </p>
        {!open && <Button onClick={() => setOpen(true)}>Write a review</Button>}
      </div>
      {open && (
        <ReviewForm
          bookingId={booking.id}
          onCancel={() => setOpen(false)}
          onSaved={() => {
            setDone(true);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
