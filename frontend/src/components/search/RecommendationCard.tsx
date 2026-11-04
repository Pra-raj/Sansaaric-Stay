"use client";

import type { Hotel } from "@/types";
import Link from "next/link";
import { useSaved } from "@/lib/saved-context";
import { getSeedMedia } from "@/lib/seed-media";

function RecommendationCard({ hotel }: { hotel: Hotel }) {
  const { isSaved, toggleSaved } = useSaved();
  const saved = isSaved(hotel.id);
  const media = getSeedMedia(hotel.name);

  return (
    <Link
      href={`/hotels/${hotel.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-sm ring-1 ring-black/[0.03] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {media ? (
        <div className="h-36 shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media.images[0]}
            alt={hotel.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none"
          />
        </div>
      ) : (
        <div className="flex h-36 shrink-0 items-center justify-center bg-brand-100 text-xs text-brand-600">
          [ thumbnail placeholder ]
        </div>
      )}
      <div className="space-y-1 p-4">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold">{hotel.name}</h3>
          <button
            aria-label={saved ? "Remove from saved" : "Save"}
            onClick={(e) => {
              e.preventDefault();
              toggleSaved(hotel.id);
            }}
            className={saved ? "text-red-500" : "text-ink-soft hover:text-red-500"}
          >
            {saved ? "♥" : "♡"}
          </button>
        </div>
        <p className="text-sm text-ink-soft">{hotel.location}</p>
        <p className="text-sm">★ {hotel.rating.toFixed(1)}</p>
        <p className="text-sm font-semibold">
          NPR {hotel.startingPrice.toLocaleString()} / night
        </p>
      </div>
    </Link>
  );
}

export default RecommendationCard;