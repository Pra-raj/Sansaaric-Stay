import { Home, Star, Video, Wallet } from "lucide-react";
import Reveal from "@/components/ui/Reveal";

const reasons = [
  {
    icon: Video,
    title: "Video-first listings",
    body: "Short videos and photos show the stay as it is, before you book.",
  },
  {
    icon: Home,
    title: "Independent local hosts",
    body: "Homestays, small hotels and resorts run by the people who own them.",
  },
  {
    icon: Wallet,
    title: "Clear prices in NPR",
    body: "Prices are shown in Nepalese rupees, so there is no guessing.",
  },
  {
    icon: Star,
    title: "Honest reviews from real stays",
    body: "Reviews come from guests after their stay has ended.",
  },
];

/** Four small benefit cards with a gentle hover lift. */
export function WhyGuests() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal className="max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-[#e86f51]">
            Why guests like it
          </p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Built around what guests actually need
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {reasons.map((reason, i) => {
            const Icon = reason.icon;
            return (
              <Reveal
                key={reason.title}
                delay={i * 90}
                className="rounded-card border border-border bg-surface p-5 shadow-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15">
                  <Icon aria-hidden className="size-[18px]" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{reason.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{reason.body}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default WhyGuests;
