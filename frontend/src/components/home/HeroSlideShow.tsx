"use client";

import { useRef, useState } from "react";
import BookingSearch from "@/components/home/BookingSearch";

// Sample hero videos (public/seed/hero/1.mp4 ...). Replace with real ones, same names.
// If a video is missing the hero shows the green gradient.
const SLIDES = ["/seed/hero/1.mp4", "/seed/hero/2.mp4", "/seed/hero/3.mp4"];

function HeroSlideShow() {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <section className="relative flex min-h-[560px] w-full items-center justify-center overflow-hidden bg-gradient-to-b from-brand-700 via-brand-600 to-brand-500 px-4 py-12 text-white md:min-h-[600px] lg:min-h-[480px] lg:px-0 lg:py-0">
      {!failed && (
        <video
          key={SLIDES[active]}
          ref={videoRef}
          src={SLIDES[active]}
          autoPlay
          muted
          playsInline
          onEnded={() => setActive((a) => (a + 1) % SLIDES.length)}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-black/35" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-3xl px-6 text-center">
        <h1 className="text-3xl font-bold md:text-4xl">
          Find your next stay in Nepal
        </h1>
        <BookingSearch />
      </div>
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">
        {SLIDES.map((_, n) => (
          <button
            key={n}
            onClick={() => setActive(n)}
            aria-label={`Show video ${n + 1}`}
            className={`h-2 w-2 rounded-full ${n === active ? "bg-white" : "bg-white/40"}`}
          />
        ))}
      </div>
    </section>
  );
}

export default HeroSlideShow;
