import type { Hotel } from "@/types";
import Link from "next/link";
import { getSeedMedia } from "@/lib/seed-media";

export function VideoCard({ hotel }: { hotel: Hotel }) {
  const media = getSeedMedia(hotel.name);
  return (
    <section className="relative flex h-[100dvh] w-full snap-start items-end justify-center bg-gradient-to-b from-brand-900 via-brand-600 to-brand-400 md:h-[80vh] md:rounded-card">
      {media?.video ? (
        <video
          src={media.video}
          poster={media.images[0]}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover md:rounded-card"
        />
      ) : (
        <div className="absolute inset-0  flex items-center justify-center text-white/30">
          <span className="text-sm">[ video placeholder — {hotel.name} ]</span>
        </div>
      )}

      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-5 text-white">
        <ActionButton icon="♥" label="Like" />
        <ActionButton icon="💬" label="Ask" />
        <ActionButton icon="↗" label="Share" />

        <Link
          href={`/hotels/${hotel.id}`}
          className="flex flex-col items-center gap-1"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-500 text-lg">
            🏨
          </span>
          <span className="text-[11px] font-semibold">Book</span>
        </Link>
      </div>

      <div className="relative z-10 w-full space-y-2 bg-gradient-to-t from-black/70 to-transparent p-5 text-white">
        <div className="flex flex-wrap gap-1.5">
          {hotel.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-white/15 px-2.5 py-0.5  text-[11px] backdrop-blur"
            >
              {tag}
            </span>
          ))}
        </div>

        <Link href={`/hotels/${hotel.id}`} className="block text-lg font-bold">
          {hotel.name}
        </Link>

        <p className="text-sm text-white/80">
          {hotel.location} · ★ {hotel.rating.toFixed(1)}
        </p>
        <p className="text-sm font-semibold">
          From NPR {hotel.startingPrice.toLocaleString()} / night
        </p>
      </div>
    </section>
  );
}

function ActionButton({ icon, label }: { icon: string; label: string }) {
  return (
    <button className="flex flex-col items-center gap-1">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-lg backdrop-blur">
        {icon}
      </span>

      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  );
}