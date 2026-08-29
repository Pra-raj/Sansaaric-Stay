import { BookingDraft } from "@/types";

export default function BookingSummary({ draft }: { draft: BookingDraft }) {
  return (
    <div className="h-fit space-y-5 rounded-card border border-black/5 bg-surface p-5 md:sticky md:top-24">
      <div className="flex h-24 items-center justify-center rounded-lg bg-brand-100 text-xs text-brand-600">
        [ property photo ]
      </div>
      <div>
        <h3 className="font-semibold">{draft.hotelName}</h3>
      </div>
      <dl className="space-y-2 text-sm">
        <Row label="check-in" value={draft.checkIn} />
        <Row label="check-out" value={draft.checkOut} />
        <Row label="Guests" value={String(draft.guests)} />
        <Row
          label={`NPR ${draft.pricePerNight.toLocaleString()} x ${draft.nights} nights `}
          value={`NPR ${(draft.pricePerNight * draft.nights).toLocaleString()} nights `}
        />
        <Row
          label="Service fee"
          value={`NPR ${draft.serviceFee.toLocaleString()}`}
        />
        <div className="flex justify-between border-t border-black/10 pt-3 text-base font-semibold">
          <span>Total</span>
          <span>NPR {draft.total.toLocaleString()}</span>
        </div>
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-soft">
      <dt>{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
