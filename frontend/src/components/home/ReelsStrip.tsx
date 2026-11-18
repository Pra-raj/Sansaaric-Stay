"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { getReels } from "@/lib/api-client";
import type { Reel } from "@/types";

/** Hover playback is a desktop nicety; reduced-motion users keep the poster. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function ReelTile({ reel }: { reel: Reel }) {
  const [hovered, setHovered] = useState(false);
  const showVideo = hovered && !prefersReducedMotion();

  return (
    <Link
      href="/reels"
      aria-label={`Watch reels${reel.hotelName ? ` — ${reel.hotelName}` : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="group relative aspect-[9/16] w-36 shrink-0 snap-start overflow-hidden rounded-card border border-border bg-black shadow-sm sm:w-44"
    >
      {reel.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={reel.posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-brand-700 to-brand-500" />
      )}

      {showVideo && (
        <video
          src={reel.videoUrl}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"
      />

      <span className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-colors group-hover:bg-black/60">
        <Play aria-hidden className="size-5" fill="currentColor" />
      </span>

      <div className="absolute inset-x-0 bottom-0 p-3 text-white">
        {reel.hotelName && (
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{reel.hotelName}</p>
        )}
        {reel.location && (
          <p className="mt-0.5 truncate text-xs text-white/75">{reel.location}</p>
        )}
      </div>
    </Link>
  );
}

/**
 * "Watch reels" strip below Recommendation. Renders nothing until the reel
 * endpoint exists, so the home page stays exactly as it is today.
 */
export function ReelsStrip() {
  const [reels, setReels] = useState<Reel[] | null>(null);

  useEffect(() => {
    let alive = true;
    getReels(8)
      .then((rows) => {
        if (alive) setReels(rows);
      })
      .catch(() => {
        if (alive) setReels([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!reels || reels.length === 0) return null;

  return (
    <section className="bg-surface py-12">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-[#e86f51]">
              Watch
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Reels</h2>
          </div>
          <Link href="/reels" className="shrink-0 text-sm font-semibold text-brand-600 hover:underline">
            All reels <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="flex snap-x gap-4 overflow-x-auto pb-2">
          {reels.map((reel) => (
            <ReelTile key={reel.id} reel={reel} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default ReelsStrip;
