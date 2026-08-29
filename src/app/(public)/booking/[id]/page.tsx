"use client";

import BookingSummary from "@/components/booking/BookingSummary";
import StepIndicator from "@/components/booking/StepIndicator";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { getHotelById } from "@/lib/placeholder-data";
import { BookingDraft } from "@/types";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useState } from "react";

export default function BookinglowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const hotel = getHotelById(id);
  const router = useRouter();
  const [step, setstep] = useState(1);

  if (!hotel) {
    return <p className="p-8"> Hotel not found.</p>;
  }
  const draft: BookingDraft = {
    hotelId: hotel.id,
    hotelName: hotel.name,
    checkIn: "sep 12, 2026",
    checkOut: "sep 15, 2026",
    guests: 2,
    nights: 3,
    pricePerNight: hotel.startingPrice,
    serviceFee: 250,
    total: hotel.startingPrice * 3 + 250,
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <StepIndicator current={step} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div className="rounded-card border border-black/5 bg-surface p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Trip details</h2>
              <div className=" grid grid-cols-2 gap-4">
                <Input
                  id="checkin"
                  label="Check-in"
                  type="date"
                  defaultValue="2026-09-12"
                />
                <Input
                  id="checkout"
                  label="Check-out"
                  type="date"
                  defaultValue="2026-09-15"
                />
              </div>
              <Input
                id="guests"
                label="Guests"
                type="number"
                defaultValue={2}
                min={1}
              />
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Guest info</h2>
              <Input
                id="full-name"
                label="Full name"
                placeholder="Anika sharma"
              />
              <Input
                id="email"
                label="Email"
                type="email"
                placeholder="anika@example.com"
              />
              <Input
                id="phone"
                label="Phone"
                type="tel"
                placeholder="98xxxxxxxx"
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">Payment</h2>
              <div className="grid grid-cols-3 gap-3">
                {["eSewa", "khalti", "Card"].map((method) => (
                  <label
                    key={method}
                    className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-black/10 p-4 text-sm font-semibold has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
                  >
                    <input
                      type="radio"
                      name="pament-method"
                      defaultChecked={method === "eSewa"}
                      className="sr-only"
                    />
                    {method}
                  </label>
                ))}
              </div>
              <label className="flex items-start gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-black/20"
                />
                I agree to the property&apos;s cancellation policy.
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-center">
              <div
                aria-label="Booking confirmed"
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
              >
                <Check aria-hidden="true" className="size-7" strokeWidth={3} />
              </div>
              <h2 className="text-lg font-semibold">Booking confirmed</h2>
              <p className="text-sm text-ink-soft">
                A confirmation has been sent to your email with your booking
                reference.{" "}
              </p>
            </div>
          )}
          <div className="mt-8 flex justify-between">
            {step > 1 && step < 4 ? (
              <Button variant="ghost" onClick={() => setstep((s) => s - 1)}>
                Back
              </Button>
            ) : (
              <span />
            )}
            {step < 3 && (
              <Button onClick={() => setstep((s) => s + 1)}>Continue</Button>
            )}
            {step === 3 && (
              <Button onClick={() => setstep(4)}>
                Pay NPR {draft.total.toLocaleString()}
              </Button>
            )}
            {step === 4 && (
              <Button
                onClick={() => router.push("/account")}
                className="ml-auto"
              >
                View my bookings
              </Button>
            )}
          </div>
        </div>
        <BookingSummary draft={draft} />
      </div>
    </div>
  );
}
