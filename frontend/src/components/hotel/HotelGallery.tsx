"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { HotelMedia } from "@/lib/seed-media";
import type { HotelMediaApi } from "@/types";

type Item = { kind: "image" | "video"; src: string };

/** Accepts either the seed shape (images/video) or the API shape (photos/video). */
function toItems(media: HotelMedia | HotelMediaApi): Item[] {
  if ("photos" in media) {
    return [
      ...media.photos.map((photo) => ({ kind: "image" as const, src: photo.url })),
      ...(media.video ? [{ kind: "video" as const, src: media.video.url }] : []),
    ];
  }
  return [
    ...media.images.map((src) => ({ kind: "image" as const, src })),
    ...(media.video ? [{ kind: "video" as const, src: media.video }] : []),
  ];
}

export function HotelGallery({ media, name }: { media: HotelMedia | HotelMediaApi; name: string }) {
  const items = toItems(media);
  const [active, setActive] = useState(0);
  const current = items[active];

  if (!current) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-bg text-ink-soft">
        <ImageOff aria-hidden className="size-6" />
        <p className="text-sm">No photos yet</p>
      </div>
    );
  }

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
            key={`${item.kind}-${item.src}`}
            onClick={() => setActive(i)}
            aria-label={item.kind === "video" ? "Play video" : `Photo ${i + 1}`}
            aria-current={i === active ? "true" : undefined}
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
