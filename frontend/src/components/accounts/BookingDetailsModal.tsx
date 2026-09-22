import { Modal } from "../auth/Modal";
import { Badge } from "../ui/Badge";
import { statusTone } from "@/lib/booking-utils";
import type { Booking } from "@/types";

export function BookingDetailsModal({
  booking,
  onClose,
}: {
  booking: Booking;
  onClose: () => void;
}) {
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
