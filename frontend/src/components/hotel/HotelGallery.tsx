"use client";

import { useState } from "react";
import type { HotelMedia } from "@/lib/seed-media";

type Item = { kind: "image" | "video"; src: string };

export function HotelGallery({ media, name }: { media: HotelMedia; name: string }) {
  const items: Item[] = [
    ...media.images.map((src) => ({ kind: "image" as const, src })),
    ...(media.video ? [{ kind: "video" as const, src: media.video }] : []),
  ];
  const [active, setActive] = useState(0);
  const current = items[active];

  return (
    <div className="space-y-2">
      <div className="aspect-video overflow-hidden rounded-card bg-black shadow-xl">
        {current.kind === "video" ? (
          <video
            key={current.src}
            src={current.src}
            controls
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.src} alt={name} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item, i) => (
          <button
            key={item.src}
            onClick={() => setActive(i)}
            aria-label={item.kind === "video" ? "Play video" : `Photo ${i + 1}`}
            className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 ${
              i === active ? "border-brand-500" : "border-transparent"
            }`}
          >
            {item.kind === "video" ? (
              <span className="flex h-full w-full items-center justify-center bg-black text-xs text-white">
                ▶ Video
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.src} alt="" className="h-full w-full object-cover" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
