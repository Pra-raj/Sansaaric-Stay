import { CalendarDays, Clapperboard, MessageCircle } from "lucide-react";
import Reveal from "@/components/ui/Reveal";

const rows = [
  {
    icon: Clapperboard,
    title: "Short videos and photos",
    note: "See the room, the view and the surroundings before you decide.",
  },
  {
    icon: CalendarDays,
    title: "Compare and choose dates",
    note: "Check prices, pick the stay and the dates that fit your trip.",
  },
  {
    icon: MessageCircle,
    title: "Book without the back-and-forth",
    note: "Book online, and ask our assistant when a question comes up.",
  },
];

/** "What we do" — copy on the left, an icon-and-gradient card stack on the right. */
export function WhatWeDo() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-2">
        <Reveal>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-[#e86f51]">
            What we do
          </p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            A clearer way to choose where you stay
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft sm:text-base">
            Guests discover stays through short videos and photos, compare them side by
            side, and book online — no long message threads needed. Our assistant answers
            questions about the stays while you browse.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft sm:text-base">
            Every listing belongs to an independently owned homestay, small hotel or
            resort, so the place you book is run by the people who know it best.
          </p>
        </Reveal>

        <Reveal delay={120} className="relative mx-auto w-full max-w-md">
          <div className="relative aspect-[4/3]">
            <div
              aria-hidden
              className="absolute inset-x-8 top-0 h-[85%] rotate-[-5deg] rounded-card border border-border bg-surface shadow-sm"
            />
            <div
              aria-hidden
              className="absolute inset-x-4 top-4 h-[85%] rotate-[3deg] rounded-card border border-border bg-surface shadow-md"
            />
            <div className="absolute inset-0 flex flex-col justify-center gap-3 overflow-hidden rounded-card border border-border bg-surface p-4 shadow-lg sm:p-6">
              <div aria-hidden className="absolute -right-10 -top-10 size-32 rounded-full bg-brand-500/10 blur-2xl" />
              {rows.map((row) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.title}
                    className="relative flex items-start gap-3 rounded-2xl border border-border/60 bg-bg/60 p-3"
                  >
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15">
                      <Icon aria-hidden className="size-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{row.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                        {row.note}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default WhatWeDo;
