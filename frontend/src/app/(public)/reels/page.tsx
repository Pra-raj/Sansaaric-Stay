import type { Metadata } from "next";
import { getReels } from "@/lib/api-client";
import { ReelsFeed } from "@/components/video-feed/ReelsFeed";
import type { Reel } from "@/types";

export const metadata: Metadata = {
  title: "Reels",
  description: "Short videos from independently owned stays across Nepal.",
};

// The feed is live data; never bake it into the build.
export const dynamic = "force-dynamic";

export default async function ReelsPage() {
  let reels: Reel[] = [];
  let failed = false;
  try {
    reels = await getReels(24);
  } catch {
    failed = true;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-[#e86f51]">
          Watch
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Reels</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Short videos from independent stays around Nepal.
        </p>
      </div>
      <ReelsFeed reels={reels} failed={failed} />
    </div>
  );
}
