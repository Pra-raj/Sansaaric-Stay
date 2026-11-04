"use client";

import { useEffect, useState } from "react";
import DestinationCard from "@/components/home/DestinationCard";
import { getDestinations } from "@/lib/api-client";
import type { Destination as DestinationType } from "@/types";

export default function Destination() {
  // Real counts from the backend (published hotels only). No fake numbers.
  const [destinations, setDestinations] = useState<DestinationType[] | null>(null);

  useEffect(() => {
    let alive = true;
    getDestinations()
      .then((d) => alive && setDestinations(d))
      .catch(() => alive && setDestinations([]));
    return () => {
      alive = false;
    };
  }, []);

  if (destinations && destinations.length === 0) return null;

  return (
    <section className="bg-brand-50 py-12 dark:bg-[#151a13]">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-[#e86f51]">
            Go somewhere new
          </p>
          <h3 className="text-4xl font-semibold tracking-tight sm:text-5xl dark:text-ink">
            Top Destinations
          </h3>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {destinations
            ? destinations.map((d, i) => (
                <div
                  key={d.id}
                  className="anim-fade-in"
                  style={{ animationDelay: `${i * 70}ms`, animationFillMode: "backwards" }}
                >
                  <DestinationCard destination={d} />
                </div>
              ))
            : [0, 1, 2, 3].map((n) => (
                <div key={n} className="h-64 animate-pulse rounded-card border border-border bg-surface" />
              ))}
        </div>
      </div>
    </section>
  );
}
