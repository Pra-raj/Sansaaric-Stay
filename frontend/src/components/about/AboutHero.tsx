import Link from "next/link";
import Reveal from "@/components/ui/Reveal";

const primaryLink =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600";
const secondaryLink =
  "inline-flex items-center justify-center gap-2 rounded-full border border-brand-500 bg-surface px-5 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 dark:hover:bg-brand-50/10";

/** Hero band for /about — soft brand gradient with slowly drifting shapes. */
export function AboutHero() {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-brand-50 to-transparent dark:from-[#151a13] dark:to-transparent">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="drift-slow absolute -left-24 -top-24 size-72 rounded-full bg-brand-100/80 blur-3xl dark:bg-brand-600/20" />
        <div className="drift-slower absolute -right-20 top-10 size-80 rounded-full bg-accent-400/25 blur-3xl dark:bg-accent-500/10" />
        <div className="drift-slow absolute bottom-0 left-1/3 size-56 rounded-full bg-brand-500/10 blur-3xl dark:bg-brand-500/10" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <Reveal>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-[#e86f51]">
            About us
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Independent stays across Nepal, easier to find and easier to book.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">
            Sansaaric Stay is a digital booking partner for independently owned homestays,
            small hotels and resorts in Nepal. We help guests see a place before they go,
            compare it with others, and book it online.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/search" className={primaryLink}>
              Explore stays
            </Link>
            <Link href="/contact" className={secondaryLink}>
              Contact us
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default AboutHero;
