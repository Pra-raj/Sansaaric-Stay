"use client";

import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { Hotel } from "@/types";
import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { AccountSidebar } from "./AccountSidebar";
import RecommendationCard from "../search/RecommendationCard";
import { useSaved } from "@/lib/saved-context";
import { getHotels } from "@/lib/api-client";
import { Skeleton } from "../ui/Skeleton";

export function SavedView() {
  const { isLoggedIn, user } = useAuth();
  const { openLogin } = useAuthModal();
  const { savedIds } = useSaved();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    getHotels()
      .then((result) => {
        if (!cancelled) {
          setHotels(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load your saved stays. Please refresh the page.");
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
          <span>&#128274;</span>
        </div>
        <h1 className="text-2xl font-bold">Log in to view saved stays</h1>
        <Button className="mt-6" onClick={openLogin}>
          Log in
        </Button>
      </div>
    );
  }

  const savedHotels = hotels.filter((h) => savedIds.includes(h.id));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
        <AccountSidebar user={user} />
        <div>
          <h1 className="mb-4 text-2xl font-bold">Saved Stays</h1>
          {error ? (
            <p className="py-12 text-center text-sm text-ink-soft">{error}</p>
          ) : loading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Skeleton className="h-56 rounded-card" />
              <Skeleton className="h-56 rounded-card" />
            </div>
          ) : savedHotels.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {savedHotels.map((hotel) => (
                <RecommendationCard key={hotel.id} hotel={hotel} />
              ))}
            </div>
          ) : (
            <p className="rounded-card border border-dashed border-border/10 py-12 text-center text-sm text-ink-soft">
              Nothing saved yet. Start exploring and save your favorite stays to
              view them here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
