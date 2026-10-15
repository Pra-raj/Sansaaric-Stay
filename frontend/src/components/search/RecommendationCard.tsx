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
      className="block overflow-hidden rounded-card border border-border/10 bg-surface transition-shadow hover:shadow-md"
    >
      {media ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.images[0]} alt={hotel.name} className="h-36 w-full object-cover" />
      ) : (
        <div className="flex h-36 items-center justify-center bg-brand-100 text-xs text-brand-600">
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