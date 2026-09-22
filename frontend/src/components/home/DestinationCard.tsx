import Link from "next/link";
import type { Destination } from "@/types";

export default function DestinationCard({ destination }: { destination: Destination }) {
  return (
    <Link
      href={`/search?location=${encodeURIComponent(destination.name)}`}
      className="group overflow-hidden rounded-card border border-border/70 bg-surface shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-lg"
    >
      <div className="flex h-50 items-center justify-center bg-brand-100 text-brand-600 dark:bg-brand-700/40 dark:text-brand-500">
        [photo]
      </div>
      <div className="p-3">
        <h3 className="font-semibold group-hover:text-brand-600">
          {destination.name}
        </h3>
        <p className="text-xs text-ink-soft">{destination.hotelCount} stays</p>
      </div>
    </Link>
  );
}
