import type { Booking } from "@/types";
import type { MyReview } from "./api-client";

/** Only this customer's bookings (staff accounts receive everyone's). */
export function onlyMine(bookings: Booking[], userId?: string): Booking[] {
  if (!userId) return bookings;
  return bookings.filter((b) => !b.userId || b.userId === userId);
}

/** A stay can be reviewed once it has ended, was not cancelled, and has no review yet. */
export function canReview(b: Booking, reviews: MyReview[]): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return (
    b.status !== "Cancelled" &&
    b.checkOut <= today &&
    !reviews.some((r) => r.bookingId === b.id)
  );
}
