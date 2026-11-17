"use client";

import { useState } from "react";
import Link from "next/link";
import type { Destination } from "@/types";
import { getDestinationImage } from "@/lib/seed-media";

const GRADIENTS = [
  "from-emerald-500 to-teal-700",
  "from-sky-500 to-indigo-700",
  "from-amber-500 to-rose-600",
  "from-lime-500 to-green-700",
];

export default function DestinationCard({ destination }: { destination: Destination }) {
  const photo = getDestinationImage(destination.name);
  const [failed, setFailed] = useState(false);
  const gradient = GRADIENTS[destination.name.length % GRADIENTS.length];

  return (
    <Link
      href={`/search?location=${encodeURIComponent(destination.name)}`}
      className="group block overflow-hidden rounded-card border border-border bg-surface shadow-sm ring-1 ring-black/[0.03] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {photo && !failed ? (
        <div className="h-50 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt={destination.name}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none"
          />
        </div>
      ) : (
        <div
          className={`flex h-50 items-center justify-center bg-gradient-to-br ${gradient} text-2xl font-semibold text-white`}
        >
          {destination.name}
        </div>
      )}
      <div className="p-3">
        <h3 className="font-semibold group-hover:text-brand-600">{destination.name}</h3>
        <p className="text-xs text-ink-soft">
          {destination.hotelCount} {destination.hotelCount === 1 ? "stay" : "stays"}
        </p>
      </div>
    </Link>
  );
}
