import Reveal from "@/components/ui/Reveal";

/** Hero band for /contact, same visual language as the About page. */
export function ContactHero() {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-brand-50 to-transparent dark:from-[#151a13] dark:to-transparent">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="drift-slower absolute -right-24 -top-24 size-72 rounded-full bg-brand-100/80 blur-3xl dark:bg-brand-600/20" />
        <div className="drift-slow absolute -left-16 top-16 size-64 rounded-full bg-accent-400/25 blur-3xl dark:bg-accent-500/10" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <Reveal>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-[#e86f51]">
            Contact us
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            We&apos;d love to hear from you
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">
            Questions about a stay, a booking or listing your property? Call us, message
            us on WhatsApp, or send a message below.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export default ContactHero;
