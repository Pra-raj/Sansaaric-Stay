import Link from "next/link";
import { ArrowLeft, Compass, Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center overflow-hidden bg-bg">
      <div
        aria-hidden="true"
        className="absolute -right-20 top-16 size-64 rounded-full border-[18px] border-accent-400/20 sm:size-96"
      />
      <div
        aria-hidden="true"
        className="absolute -left-24 bottom-0 size-72 rounded-full border-[12px] border-brand-100 sm:size-[28rem]"
      />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-6 py-16 lg:grid-cols-[1fr_0.8fr] lg:gap-24">
          <div>
            <div className="mb-8 flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">
              <span className="flex size-10 items-center justify-center rounded-full bg-brand-100">
                <Compass aria-hidden="true" className="size-5" />
              </span>
              <span>Off the map</span>
            </div>

            <p className="font-mono text-8xl font-bold leading-none tracking-tight text-brand-600 sm:text-[10rem]">
              404
            </p>
            <h1 className="mt-5 max-w-xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              This stay could not be found.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-ink-soft sm:text-lg">
              The page may have moved, or the address may have taken a wrong
              turn. Let us get you back to places worth staying.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                <Home aria-hidden="true" className="size-4" />
                Back to home
              </Link>
              <Link
                href="/search"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-500 bg-surface px-5 py-3 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50"
              >
                <Search aria-hidden="true" className="size-4" />
                Explore stays
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm lg:justify-self-end">
            <div className="rotate-3 rounded-[2rem] border border-brand-100 bg-surface p-3 shadow-[0_24px_60px_rgba(47,107,54,0.12)]">
              <div className="flex aspect-[4/5] flex-col justify-between rounded-[1.5rem] bg-brand-600 p-7 text-white">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-brand-100">
                  <span>Sansaaric Stay</span>
                  <span>Map note</span>
                </div>
                <div>
                  <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-accent-400 text-brand-700">
                    <Compass aria-hidden="true" className="size-8" />
                  </div>
                  <p className="text-2xl font-bold leading-tight">
                    Every good journey has a detour.
                  </p>
                  <div className="mt-8 flex items-center gap-2 text-sm text-brand-100">
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    Choose a new direction
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
