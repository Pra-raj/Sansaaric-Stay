"use client";

import { useAuthModal } from "@/lib/auth-modal-context";
import { Booking } from "@/types";
import { Button } from "../ui/Button";
import { useAuth } from "@/lib/auth-context";
import { dummyBookings } from "@/lib/placeholder-data";
import { Badge } from "../ui/Badge";

const tabs = ["Upcoming", "Completed", "Cancelled"] as const;
function statusTone(status: Booking["status"]) {
  if (status === "Upcoming") return "brand" as const;
  if (status === "Completed") return "success" as const;
  return "neutral" as const;
}

export function AccountView() {
  const { isLoggedIn, user } = useAuth();
  const { openLogin } = useAuthModal();

  if (!isLoggedIn || !user) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl">
          &#x1F512;
        </div>
        <h1 className="text-2xl font-bold">Login To view your Bookings</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">
          Your bookings, saved stays, and reviews live here once you&apos;re
          signed in.
        </p>
        <Button className="mt-6" onClick={openLogin}>
          Log in
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-card border border-black/5 bg-surface p-4">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-600">
              {user.initials}
            </div>
            <p className="font-semibold">{user.name}</p>
            <p className="text-xs text-ink-soft">{user.email}</p>
          </div>
          <nav className="space-y-1 text-sm font-medium text-ink-soft">
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-brand-600">
              Bookings
            </p>
            <p className="rounded-lg px-3 py-2">Saved</p>
            <p className="rounded-lg px-3 py-2">Reviews</p>
            <p className="rounded-lg px-3 py-2">Payment methods</p>
            <p className="rounded-lg px-3 py-2">Settings</p>
          </nav>
        </aside>

        <div>
          <h1 className="mb-4 text-2xl font-bold">My bookings</h1>
          <div className="mb-6 flex gap-2 border-b border-black/10">
            {tabs.map((tab, i) => (
              <span
                key={tab}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${i === 0 ? "border-brand-500 text-brand-600" : "border-transparent text-ink-soft"}`}
              >
                {tab}
              </span>
            ))}
          </div>
          <div className="space-y-4">
            {dummyBookings.map((booking) => (
              <div
                key={booking.id}
                className="flex flex-col gap-4 rounded-card border border-black/5 bg-surface p-4 sm:flex-row sm:items-center"
              >
                <div className="h-20 w-full shrink-0 rounded-lg bg-brand-100 sm:w-28" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{booking.hotelName}</h3>
                    <Badge tone={statusTone(booking.status)}>
                      {booking.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-soft">{booking.location}</p>
                  <p className="text-sm text-ink-soft">
                    {booking.checkIn} &#x2192; {booking.checkOut} &#x2022;{" "}
                    {booking.guests}
                  </p>
                  <p className="text-xs text-ink-soft">
                    Booking ID: {booking.id}
                  </p>
                </div>
                <button className="text-sm font-semibold text-brand-600 hover:underline">
                  View details
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
