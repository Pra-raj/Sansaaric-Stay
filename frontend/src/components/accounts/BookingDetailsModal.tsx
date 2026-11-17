"use client";

import { useState } from "react";
import { Modal } from "../auth/Modal";
import { Badge } from "../ui/Badge";
import { statusTone } from "@/lib/booking-utils";
import { ApiError, cancelBooking } from "@/lib/api-client";
import type { Booking } from "@/types";

export function BookingDetailsModal({
  booking,
  onClose,
  onCancelled,
}: {
  booking: Booking;
  onClose: () => void;
  onCancelled?: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  // Only pending bookings can be cancelled (backend rule); confirmed ones show
  // no button until the backend supports it.
  const canCancel = booking.rawStatus === "pending";

  async function handleCancel() {
    setCancelling(true);
    setError("");
    try {
      await cancelBooking(booking.id);
      onCancelled?.(booking.id);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not cancel. Please try again.",
      );
      setCancelling(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="rounded-card border border-border/10 bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-bold">{booking.hotelName}</h2>
          <Badge tone={statusTone(booking.status)}>{booking.status}</Badge>
        </div>
        <dl className="space-y-2.5 text-sm">
          <Row label="Location" value={booking.location} />
          <Row label="Check-in" value={booking.checkIn} />
          <Row label="Check-out" value={booking.checkOut} />
          <Row label="Guests" value={String(booking.guests)} />
          <Row label="Booking ID" value={booking.id} mono />
        </dl>

        {canCancel && (
          <div className="mt-5 border-t border-border/10 pt-4">
            {confirming ? (
              <div className="space-y-2">
                <p className="text-sm text-ink-soft">
                  Are you sure you want to cancel this booking?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCancel()}
                    disabled={cancelling}
                    className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    {cancelling ? "Cancelling…" : "Yes, cancel"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(false);
                      setError("");
                    }}
                    disabled={cancelling}
                    className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-bg disabled:opacity-50"
                  >
                    Keep booking
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                Cancel booking
              </button>
            )}
            {error && (
              <p role="alert" className="mt-2 text-xs font-medium text-red-600">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between border-b border-border/10 pb-2.5 last:border-none">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={mono ? "font-mono" : ""}>{value}</dd>
    </div>
  );
}
