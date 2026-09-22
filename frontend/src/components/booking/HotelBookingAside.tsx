"use client";

import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useChat } from "@/lib/chat-context";
import { Button } from "@/components/ui/Button";
import type { Hotel } from "@/types";
import { useRouter } from "next/navigation";

export function HotelBookingAside({ hotel }: { hotel: Hotel }) {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const { openLogin } = useAuthModal();
  const { open: openChat } = useChat();

  function handleBookNow() {
    if (!isLoggedIn) {
      openLogin();
      return;
    }
    router.push(`/booking/${hotel.id}`);
  }

  return (
    <aside className="h-fit space-y-4 rounded-card border border-border/10 bg-surface p-5 lg:sticky lg:top-24">
      <p className="text-lg font-semibold">
        NPR {hotel.startingPrice.toLocaleString()}
        <span className="text-sm font-normal text-ink-soft"> / night</span>
      </p>
      <Button fullWidth onClick={handleBookNow}>
        {isLoggedIn ? "Book now" : "Log in to book"}
      </Button>
      {!isLoggedIn && (
        <p className="text-xs text-ink-soft">
          Log in required to book — browsing is always free.
        </p>
      )}
      <button
        onClick={openChat}
        className="flex w-full items-center justify-center gap-1.5 rounded-full border border-brand-500 bg-surface px-4 py-3 text-center text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50"
      >
        💬 Ask about this stay
      </button>
    </aside>
  );
}