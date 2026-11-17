"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import StepIndicator from "@/components/booking/StepIndicator";
import BookingSummary from "@/components/booking/BookingSummary";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { createBooking, getHotelById, getHotelRooms, type Room } from "@/lib/api-client";
import { isDateRangeValid, nightsBetween, todayISO } from "@/lib/date-utils";
import { isValidEmail } from "@/lib/validation";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import type { BookingDraft, Hotel } from "@/types";

const MAX_GUESTS = 12;

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
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("");

  const [step, setStep] = useState(1);
  const [step1Attempted, setStep1Attempted] = useState(false);
  const [step2Attempted, setStep2Attempted] = useState(false);

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
  const [agreeError, setAgreeError] = useState(false);
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
    getHotelRooms(id).then((list) => {
      if (cancelled) return;
      setRooms(list);
      // Pre-select the cheapest room.
      const cheapest = [...list].sort((a, b) => a.price - b.price)[0];
      if (cheapest) setRoomId(cheapest.id);
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
  const room = rooms.find((r) => r.id === roomId) ?? null;
  const maxGuests = room ? Math.min(room.maxGuests, MAX_GUESTS) : MAX_GUESTS;
  const guestsValid = guests >= 1 && guests <= maxGuests;
  const roomValid = rooms.length === 0 || room !== null;
  const step1Valid = dateRangeValid && guestsValid && roomValid;
  const checkInError = !checkIn
    ? "Check-in date is required."
    : checkIn < todayISO()
      ? "Check-in cannot be in the past."
      : "";
  const checkOutError = !checkOut
    ? "Check-out date is required."
    : checkIn && checkOut <= checkIn
      ? "Check-out must be after check-in."
      : "";

  const nameValid = fullName.trim().length > 1;
  const emailValid = isValidEmail(email);
  const phoneValid = phone.replace(/[^\d]/g, "").length >= 7;
  const step2Valid = nameValid && emailValid && phoneValid;

  const serviceFee = 250;
  const nightly = room ? room.price : hotel.startingPrice;
  const total = nightly * Math.max(nights, 1) + serviceFee;

  const draft: BookingDraft = {
    hotelId: hotel.id,
    hotelName: hotel.name,
    checkIn: checkIn || "Not selected",
    checkOut: checkOut || "Not selected",
    guests,
    nights: Math.max(nights, 1),
    pricePerNight: nightly,
    serviceFee,
    total,
  };

  function goNext() {
    setStep((s) => s + 1);
  }

  function handleStep1Continue() {
    setStep1Attempted(true);
    if (step1Valid) goNext();
  }

  function handleStep2Continue() {
    setStep2Attempted(true);
    if (step2Valid) goNext();
  }

  async function handlePay() {
    setPaymentError("");
    if (!agreedToPolicy) {
      setAgreeError(true);
      return;
    }
    setPaying(true);
    try {
      const booking = await createBooking({
        hotelId: hotel!.id,
        roomId: roomId || undefined,
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
        <div className="rounded-card border border-border bg-surface p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Trip details</h2>
              {rooms.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="room"
                    className="text-xs font-semibold uppercase tracking-wide text-ink-soft"
                  >
                    Room
                  </label>
                  <select
                    id="room"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand-500"
                  >
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} — NPR {r.price.toLocaleString()} / night (up to {r.maxGuests} guests)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="checkin"
                  label="Check-in"
                  type="date"
                  min={todayISO()}
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  error={step1Attempted && !!checkInError}
                  required
                />
                <Input
                  id="checkout"
                  label="Check-out"
                  type="date"
                  min={checkIn || todayISO()}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  error={step1Attempted && !!checkOutError}
                  required
                />
              </div>
              {step1Attempted && (checkInError || checkOutError) && (
                <div className="space-y-1">
                  {checkInError && (
                    <p className="text-xs font-medium text-red-600">{checkInError}</p>
                  )}
                  {checkOutError && (
                    <p className="text-xs font-medium text-red-600">{checkOutError}</p>
                  )}
                </div>
              )}
              <Input
                id="guests"
                label="Guests"
                type="number"
                min={1}
                max={maxGuests}
                value={guestsInput}
                onChange={(e) =>
                  setGuestsInput(e.target.value.replace(/[^\d]/g, ""))
                }
                error={step1Attempted && !guestsValid}
              />
              {step1Attempted && !guestsValid && (
                <p className="text-xs font-medium text-red-600">
                  {guests < 1
                    ? "Enter at least 1 guest."
                    : `This room fits at most ${maxGuests} guests.`}
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
                error={step2Attempted && !nameValid}
                required
              />
              {step2Attempted && !nameValid && (
                <p className="text-xs font-medium text-red-600">
                  Enter your full name.
                </p>
              )}
              <Input
                id="email"
                label="Email"
                type="email"
                placeholder="anika@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={step2Attempted && !email}
                required
              />
              {step2Attempted && email.length === 0 && (
                <p className="text-xs font-medium text-red-600">
                  Email is required.
                </p>
              )}
              {step2Attempted && email.length > 0 && !emailValid && (
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
                error={step2Attempted && !phone}
                required
              />
              {step2Attempted && phone.length === 0 && (
                <p className="text-xs font-medium text-red-600">
                  Phone number is required.
                </p>
              )}
              {step2Attempted && phone.length > 0 && !phoneValid && (
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
                {(["eSewa", "Khalti", "Card"] as const).map((method) => {
                  const isSelected = paymentMethod === method;
                  return (
                    <label
                      key={method}
                      className={`relative flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 text-sm font-semibold transition-colors ${
                        isSelected
                          ? "border-brand-500 bg-brand-500/10"
                          : "border-border bg-surface"
                      }`}
                    >
                      <input
                        type="radio"
                        name="payment-method"
                        checked={isSelected}
                        onChange={() => setPaymentMethod(method)}
                        className="sr-only"
                      />
                      {method}
                      {isSelected && (
                        <CheckCircle2
                          className="absolute right-2 top-2 h-4 w-4 text-brand-500"
                          aria-hidden="true"
                        />
                      )}
                    </label>
                  );
                })}
              </div>
              <label
                className={`flex items-start gap-2 text-sm ${
                  agreeError ? "text-red-600" : "text-ink-soft"
                }`}
              >
                <input
                  type="checkbox"
                  checked={agreedToPolicy}
                  onChange={(e) => {
                    setAgreedToPolicy(e.target.checked);
                    if (e.target.checked) setAgreeError(false);
                  }}
                  className={`mt-0.5 h-4 w-4 rounded ${
                    agreeError ? "border-red-500" : "border-border"
                  }`}
                />
                I agree to the property&apos;s cancellation policy.
              </label>
              {agreeError && (
                <p className="text-xs font-medium text-red-600">
                  You must agree to the cancellation policy to continue.
                </p>
              )}
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
              <Button onClick={handleStep1Continue}>
                Continue
              </Button>
            )}
            {step === 2 && (
              <Button onClick={handleStep2Continue}>
                Continue
              </Button>
            )}
            {step === 3 && (
              <Button onClick={handlePay} disabled={paying}>
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
