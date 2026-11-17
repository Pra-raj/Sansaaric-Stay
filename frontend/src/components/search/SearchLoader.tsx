"use client";

import { useEffect, useState } from "react";
import { SearchExperience } from "./SearchExperience";
import { Skeleton } from "../ui/Skeleton";
import { getHotels } from "@/lib/api-client";
import type { Hotel } from "@/types";

export function SearchLoader({ initialLocation }: { initialLocation: string }) {
  const [hotels, setHotels] = useState<Hotel[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getHotels()
      .then((h) => alive && setHotels(h))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <p className="py-20 text-center text-sm text-ink-soft">
        Could not load stays. Please refresh the page.
      </p>
    );
  }
  if (!hotels) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Search stays</h1>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} className="h-72 rounded-card" />
          ))}
        </div>
      </div>
    );
  }
  return <SearchExperience hotels={hotels} initialLocation={initialLocation} />;
}
