import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "@/components/ui/Reveal";

/** Host call-to-action panel. Brand gradient so it reads on light and dark. */
export function HostsCta() {
  return (
    <section className="pb-16 sm:pb-20">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal className="relative isolate overflow-hidden rounded-card bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 p-6 text-white shadow-lg sm:p-10">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-20 left-1/3 size-48 rounded-full bg-accent-400/20 blur-2xl" />
          </div>

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-white/70">
                For hosts
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Own a homestay or small hotel? Let&apos;s talk.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/80">
                Show your place through photos and video, and let guests book it online.
              </p>
            </div>
            <Link
              href="/contact"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            >
              Talk to us
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default HostsCta;
