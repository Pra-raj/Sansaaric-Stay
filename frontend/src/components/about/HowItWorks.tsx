import { CalendarDays, Clapperboard, Star } from "lucide-react";
import Reveal from "@/components/ui/Reveal";

const steps = [
  {
    icon: Clapperboard,
    title: "Discover through video and photos",
    body: "Browse stays and watch short videos of the rooms, the views and the surroundings.",
  },
  {
    icon: CalendarDays,
    title: "Choose a stay and pick your dates",
    body: "Compare prices and locations, then choose the room and the dates that work for you.",
  },
  {
    icon: Star,
    title: "Book and share your review",
    body: "Book online, enjoy the stay, and leave a review once your stay has ended.",
  },
];

/** Three numbered steps joined by a line on wider screens. */
export function HowItWorks() {
  return (
    <section className="bg-brand-50 py-16 sm:py-20 dark:bg-[#151a13]">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal className="max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-[#e86f51]">
            How it works
          </p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Three steps from scrolling to staying
          </h2>
        </Reveal>

        <div className="relative mt-10">
          <div
            aria-hidden
            className="absolute left-[16%] right-[16%] top-8 hidden border-t border-dashed border-brand-500/40 md:block"
          />
          <ol className="relative grid gap-5 md:grid-cols-3">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <Reveal
                  key={step.title}
                  as="li"
                  delay={i * 110}
                  className="rounded-card border border-border bg-surface p-5 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15">
                      <Icon aria-hidden className="size-[18px]" />
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{step.body}</p>
                </Reveal>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;
