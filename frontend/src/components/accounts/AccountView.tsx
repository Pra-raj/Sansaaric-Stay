"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthModal } from "@/lib/auth-modal-context";
import { statusTone } from "@/lib/booking-utils";
import type { Booking } from "@/types";
import { Button } from "../ui/Button";
import { useAuth } from "@/lib/auth-context";
import { getMyBookings, getMyReviews, type MyReview } from "@/lib/api-client";
import { canReview, onlyMine } from "@/lib/review-utils";
import { Badge } from "../ui/Badge";
import { Skeleton } from "../ui/Skeleton";
import { AccountSidebar } from "./AccountSidebar";
import { BookingDetailsModal } from "./BookingDetailsModal";

const tabs = ["Upcoming", "Completed", "Cancelled"] as const;

export function AccountView() {
  const { isLoggedIn, user } = useAuth();
  const { openLogin } = useAuthModal();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [myReviews, setMyReviews] = useState<MyReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Upcoming");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    getMyReviews().then((r) => !cancelled && setMyReviews(r)).catch(() => {});
    getMyBookings().then((result) => {
      if (!cancelled) {
        setBookings(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  if (!isLoggedIn || !user) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl">
          🔒
        </div>
        <h1 className="text-2xl font-bold">Log in to view your bookings</h1>
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

  const myBookings = onlyMine(bookings, user?.id);
  const visibleBookings = myBookings.filter((b) => b.status === activeTab);

  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
        <AccountSidebar user={user} />
        <div>
          <h1 className="mb-4 text-2xl font-bold">My bookings</h1>
          <div className="mb-6 flex gap-2 border-b border-black/10">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${activeTab === tab ? "border-brand-500 text-brand-600" : "border-transparent text-ink-soft"}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((n) => (
                <Skeleton key={n} className="h-24 rounded-card" />
              ))}
            </div>
          ) : visibleBookings.length > 0 ? (
            <div className="space-y-4">
              {visibleBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center"
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
                      {booking.guests} guests
                    </p>
                    <p className="text-xs text-ink-soft">
                      Booking ID: {booking.id}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    <button
                      onClick={() => setSelectedBooking(booking)}
                      className="text-sm font-semibold text-brand-600 hover:underline"
                    >
                      View details
                    </button>
                    {canReview(booking, myReviews) && (
                      <Link
                        href="/account/reviews"
                        className="text-sm font-semibold text-accent-500 hover:underline"
                      >
                        Write a review
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-card border border-dashed border-border/10 py-12 text-center text-sm text-ink-soft">
              No {activeTab.toLowerCase()} bookings.
            </p>
          )}
        </div>
      </div>

      {selectedBooking && (
        <BookingDetailsModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
        />
      )}
    </div>
  );
}