"use client";

import { useEffect, useRef, useState } from "react";
import BookingSearch from "@/components/home/BookingSearch";

// Sample hero videos (public/seed/hero/1.mp4 ...). Replace with real ones, same names.
// If a video fails to load the hero falls back to the green gradient.
const SLIDES = ["/seed/hero/1.mp4", "/seed/hero/2.mp4", "/seed/hero/3.mp4"];
const FADE_MS = 700;

function HeroSlideShow() {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);

  // All clips sit on top of each other. Only the active one is visible
  // (opacity fades), so switching is a smooth cross-fade, not a hard cut.
  useEffect(() => {
    const timers: number[] = [];
    videos.current.forEach((video, i) => {
      if (!video) return;
      if (i === active) {
        video.currentTime = 0;
        void video.play().catch(() => {});
      } else {
        // Let the old clip finish fading out before it is paused.
        timers.push(window.setTimeout(() => video.pause(), FADE_MS));
      }
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [active]);

  return (
    <section className="relative flex min-h-[560px] w-full items-center justify-center overflow-hidden bg-gradient-to-b from-brand-700 via-brand-600 to-brand-500 px-4 py-12 text-white md:min-h-[600px] lg:min-h-[480px] lg:px-0 lg:py-0">
      {!failed &&
        SLIDES.map((src, i) => (
          <video
            key={src}
            ref={(el) => {
              videos.current[i] = el;
            }}
            src={src}
            muted
            playsInline
            preload={i === 0 ? "auto" : "metadata"}
            onEnded={() => setActive((a) => (a + 1) % SLIDES.length)}
            onError={() => setFailed(true)}
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity ease-in-out motion-reduce:transition-none ${
              i === active ? "opacity-100" : "opacity-0"
            }`}
            style={{ transitionDuration: `${FADE_MS}ms` }}
          />
        ))}
      <div className="absolute inset-0 bg-black/35" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-3xl px-6 text-center">
        <h1 className="text-3xl font-bold md:text-4xl">
          Find your next stay in Nepal
        </h1>
        <BookingSearch />
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center">
        {SLIDES.map((_, n) => (
          <button
            key={n}
            onClick={() => setActive(n)}
            aria-label={`Show video ${n + 1}`}
            aria-current={n === active}
            className="flex h-6 items-center justify-center px-1"
          >
            <span
              className={`block h-2 rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none ${
                n === active ? "w-5 bg-white" : "w-2 bg-white/40"
              }`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

export default HeroSlideShow;
