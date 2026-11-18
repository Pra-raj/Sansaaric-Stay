"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, Volume2, VolumeX } from "lucide-react";
import type { Reel } from "@/types";

/**
 * Vertical, snap-scrolling reel feed. Only the reel that is at least 60%
 * visible plays; everything else is paused. Muted autoplay works on mobile
 * browsers; tapping the video (or the speaker button) changes the sound.
 */
export function ReelsFeed({ reels, failed = false }: { reels: Reel[]; failed?: boolean }) {
  const feedRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);

  // Before the observer reports anything, the first reel is the active one.
  const currentId = activeId ?? reels[0]?.id ?? null;

  useEffect(() => {
    const root = feedRef.current;
    if (!root || reels.length === 0) return;
    // Without IntersectionObserver the first reel plays (list is still usable).
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const id = entry.target.getAttribute("data-reel-id");
            if (id) setActiveId(id);
          }
        }
      },
      { threshold: [0.6] },
    );

    for (const node of root.querySelectorAll("[data-reel-id]")) observer.observe(node);
    return () => observer.disconnect();
  }, [reels]);

  useEffect(() => {
    for (const [id, video] of videoRefs.current) {
      if (id === currentId) {
        video.muted = muted;
        const playing = video.play();
        if (playing) {
          void playing.catch(() => {
            // Autoplay with sound can be blocked; fall back to silent playback.
            video.muted = true;
            setMuted(true);
            void video.play().catch(() => undefined);
          });
        }
      } else {
        video.pause();
      }
    }
  }, [currentId, muted]);

  if (failed) {
    return (
      <p className="rounded-card border border-dashed border-border py-14 text-center text-sm text-ink-soft">
        Could not load videos. Please refresh the page.
      </p>
    );
  }

  if (reels.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border py-14 text-center text-sm text-ink-soft">
        No videos yet.
      </p>
    );
  }

  return (
    <div
      ref={feedRef}
      className="h-[calc(100dvh-15rem)] min-h-[320px] snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-card lg:mx-auto lg:h-auto lg:max-w-lg lg:snap-none lg:space-y-6 lg:overflow-visible"
    >
      {reels.map((reel) => {
        const isActive = currentId === reel.id;
        return (
          <section
            key={reel.id}
            data-reel-id={reel.id}
            aria-label={reel.hotelName ? `Reel from ${reel.hotelName}` : "Stay reel"}
            onClick={(event) => {
              // Tapping the video toggles sound; buttons and links keep their job.
              if ((event.target as HTMLElement).closest("a,button")) return;
              setMuted((current) => !current);
            }}
            className="relative flex h-full w-full snap-start items-end justify-center overflow-hidden rounded-card bg-black lg:h-[75vh]"
          >
            <video
              ref={(node) => {
                if (node) videoRefs.current.set(reel.id, node);
                else videoRefs.current.delete(reel.id);
              }}
              src={reel.videoUrl}
              poster={reel.posterUrl || undefined}
              muted
              loop
              playsInline
              preload={isActive ? "auto" : "metadata"}
              className="absolute inset-0 h-full w-full object-cover"
            />

            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"
            />

            <button
              type="button"
              onClick={() => setMuted((current) => !current)}
              aria-label={muted ? "Unmute video" : "Mute video"}
              className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70"
            >
              {muted ? (
                <VolumeX aria-hidden className="size-5" />
              ) : (
                <Volume2 aria-hidden className="size-5" />
              )}
            </button>

            <div className="relative z-10 w-full space-y-2 p-5 text-white">
              {reel.hotelName && (
                <h2 className="text-lg font-bold leading-tight">{reel.hotelName}</h2>
              )}
              {reel.location && (
                <p className="flex items-center gap-1.5 text-sm text-white/80">
                  <MapPin aria-hidden className="size-3.5 shrink-0" />
                  {reel.location}
                </p>
              )}
              {reel.startingPrice !== undefined && reel.startingPrice > 0 && (
                <p className="text-sm font-semibold">
                  From NPR {reel.startingPrice.toLocaleString("en-US")} / night
                </p>
              )}
              {reel.caption && (
                <p className="line-clamp-2 text-sm text-white/80">{reel.caption}</p>
              )}
              {reel.hotelId && (
                <Link
                  href={`/hotels/${reel.hotelId}`}
                  className="mt-2 inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
                >
                  View stay
                </Link>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default ReelsFeed;
