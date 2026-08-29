"use client";
import { Hotel } from "@/types";
import Link from "next/link";

function RecommendationCard({ hotel }: { hotel: Hotel }) {
  return (
    <Link
      href={`/hotels/${hotel.id}`}
      className="block overflow-hidden rounded-card border border-ink/20 bg-surface shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-lg"
    >
      <div className="flex h-50 items-center justify-center bg-brand-100 text-xs text-brand-600">
        [Thumbnail Placeholder]
      </div>
      <div className="space-y-1 p-4">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold">{hotel.name}</h3>
          <button
            aria-label="save"
            onClick={(e) => e.preventDefault()}
            className="text-ink-soft hover:text-accent-500"
          >
            &#9829;
          </button>
        </div>
        <p className="text-sm text-ink-soft">{hotel.location}</p>
        <p className="text-sm">&#9733; {hotel.rating.toFixed(1)}</p>
        <p className="text-sm font-semibold">
          {hotel.startingPrice.toLocaleString()} / night
        </p>
      </div>
    </Link>
  );
}

export default RecommendationCard;
