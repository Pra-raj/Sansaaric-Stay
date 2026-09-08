"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import StepIndicator from "@/components/booking/StepIndicator";
import BookingSummary from "@/components/booking/BookingSummary";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { createBooking, getHotelById } from "@/lib/api-client";
import { isDateRangeValid, nightsBetween, todayISO } from "@/lib/date-utils";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import type { BookingDraft, Hotel } from "@/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_GUESTS = 10;

export default function BookingFlowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const { isLoggedIn } = useAuth();
  const { openLogin } = useAuthModal();

  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [hotelLoading, setHotelLoading] = useState(true);

  const [step, setStep] = useState(1);

  // Step 1 — trip details
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guestsInput, setGuestsInput] = useState("2");

  // Step 2 — guest info
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Step 3 — payment
  const [paymentMethod, setPaymentMethod] = useState<
    "eSewa" | "Khalti" | "Card"
  >("eSewa");
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  // Step 4 — confirmation
  const [bookingReference, setBookingReference] = useState("");

  useEffect(() => {
    let cancelled = false;
    getHotelById(id).then((result) => {
      if (!cancelled) {
        setHotel(result);
        setHotelLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (hotelLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="mb-8 h-6 w-64" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-96 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      </div>
    );
  }

  if (!hotel) {
    return <p className="p-8">Hotel not found.</p>;
  }

  if (!isLoggedIn) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl">
          🔒
        </div>
        <h1 className="text-2xl font-bold">Log in to book {hotel.name}</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">
          Create a free account or log in to pick dates, add guest details, and
          pay.
        </p>
        <Button className="mt-6" onClick={openLogin}>
          Log in
        </Button>
      </div>
    );
  }

  const guests = parseInt(guestsInput, 10) || 0;
  const nights = nightsBetween(checkIn, checkOut);
  const dateRangeValid = isDateRangeValid(checkIn, checkOut);
  const guestsValid = guests >= 1 && guests <= MAX_GUESTS;
  const step1Valid = dateRangeValid && guestsValid;

  const nameValid = fullName.trim().length > 1;
  const emailValid = EMAIL_RE.test(email);
  const phoneValid = phone.replace(/[^\d]/g, "").length >= 7;
  const step2Valid = nameValid && emailValid && phoneValid;

  const serviceFee = 250;
  const total = hotel.startingPrice * Math.max(nights, 1) + serviceFee;

  const draft: BookingDraft = {
    hotelId: hotel.id,
    hotelName: hotel.name,
    checkIn: checkIn || "Not selected",
    checkOut: checkOut || "Not selected",
    guests,
    nights: Math.max(nights, 1),
    pricePerNight: hotel.startingPrice,
    serviceFee,
    total,
  };

  function goNext() {
    setStep((s) => s + 1);
  }

  async function handlePay() {
    setPaymentError("");
    setPaying(true);
    try {
      const booking = await createBooking({
        hotelId: hotel!.id,
        checkIn,
        checkOut,
        guests,
        guestName: fullName,
        guestEmail: email,
        guestPhone: phone,
        paymentMethod,
      });
      setBookingReference(booking.id);
      setStep(4);
    } catch (err) {
      setPaymentError(
        err instanceof Error
          ? err.message
          : "Payment failed. Please try again.",
      );
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <StepIndicator current={step} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div className="rounded-card border border-border/10 bg-surface p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Trip details</h2>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="checkin"
                  label="Check-in"
                  type="date"
                  min={todayISO()}
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  required
                />
                <Input
                  id="checkout"
                  label="Check-out"
                  type="date"
                  min={checkIn || todayISO()}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  required
                />
              </div>
              {checkIn && checkOut && !dateRangeValid && (
                <p className="text-xs font-medium text-red-600">
                  Check-out must be after check-in, and check-in can&apos;t be
                  in the past.
                </p>
              )}
              <Input
                id="guests"
                label={`Guests (max ${MAX_GUESTS})`}
                type="number"
                min={1}
                max={MAX_GUESTS}
                value={guestsInput}
                onChange={(e) =>
                  setGuestsInput(e.target.value.replace(/[^\d]/g, ""))
                }
              />
              {!guestsValid && (
                <p className="text-xs font-medium text-red-600">
                  Choose between 1 and {MAX_GUESTS} guests.
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Guest info</h2>
              <Input
                id="full-name"
                label="Full name"
                placeholder="Anika Sharma"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
              <Input
                id="email"
                label="Email"
                type="email"
                placeholder="anika@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {email.length > 0 && !emailValid && (
                <p className="text-xs font-medium text-red-600">
                  Enter a valid email address.
                </p>
              )}
              <Input
                id="phone"
                label="Phone"
                type="tel"
                inputMode="numeric"
                placeholder="98XXXXXXXX"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/[^\d +\-()]/g, ""))
                }
                required
              />
              {phone.length > 0 && !phoneValid && (
                <p className="text-xs font-medium text-red-600">
                  Enter a valid phone number.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Payment</h2>
              <div className="grid grid-cols-3 gap-3">
                {(["eSewa", "Khalti", "Card"] as const).map((method) => (
                  <label
                    key={method}
                    className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-border/10 p-4 text-sm font-semibold has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
                  >
                    <input
                      type="radio"
                      name="payment-method"
                      checked={paymentMethod === method}
                      onChange={() => setPaymentMethod(method)}
                      className="sr-only"
                    />
                    {method}
                  </label>
                ))}
              </div>
              <label className="flex items-start gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={agreedToPolicy}
                  onChange={(e) => setAgreedToPolicy(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border/10"
                />
                I agree to the property&apos;s cancellation policy.
              </label>
              {paymentError && (
                <p className="text-xs font-medium text-red-600">
                  {paymentError}
                </p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
                ✓
              </div>
              <h2 className="text-lg font-semibold">Booking confirmed</h2>
              <p className="text-sm text-ink-soft">
                A confirmation has been sent to your email with your booking
                reference.
              </p>
              {bookingReference && (
                <p className="font-mono text-sm text-ink-soft">
                  Reference: {bookingReference}
                </p>
              )}
            </div>
          )}

          <div className="mt-8 flex justify-between">
            {step > 1 && step < 4 ? (
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            ) : (
              <span />
            )}

            {step === 1 && (
              <Button onClick={goNext} disabled={!step1Valid}>
                Continue
              </Button>
            )}
            {step === 2 && (
              <Button onClick={goNext} disabled={!step2Valid}>
                Continue
              </Button>
            )}
            {step === 3 && (
              <Button onClick={handlePay} disabled={!agreedToPolicy || paying}>
                {paying
                  ? "Processing payment…"
                  : `Pay NPR ${draft.total.toLocaleString()}`}
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
