import { Phone } from "lucide-react";
import Reveal from "@/components/ui/Reveal";
import {
  CONTACT_PHONE_DISPLAY,
  CONTACT_TEL_HREF,
  socialLinks,
} from "@/lib/social-links";

const cardClass =
  "group flex h-full min-w-0 flex-col rounded-card border border-border bg-surface p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0";
const iconBadgeClass =
  "flex size-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15";

/** Phone + WhatsApp + the three social profiles, each card a link. */
export function ContactCards() {
  const socials = socialLinks;

  return (
    <section className="py-4">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Reach us your way
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Tap a card to call, chat or follow along.
          </p>
        </Reveal>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Reveal delay={0}>
            <a
              href={CONTACT_TEL_HREF}
              aria-label={`Call us at ${CONTACT_PHONE_DISPLAY}`}
              className={cardClass}
            >
              <span className={iconBadgeClass}>
                <Phone aria-hidden className="size-5" />
              </span>
              <span className="mt-3 block text-sm font-semibold">Call us</span>
              <span className="mt-1 block text-sm text-ink-soft">{CONTACT_PHONE_DISPLAY}</span>
              <span className="mt-3 text-xs font-semibold text-brand-600 group-hover:underline">
                Tap to call
              </span>
            </a>
          </Reveal>

          {socials.map((social, i) => {
            const Icon = social.icon;
            return (
              <Reveal key={social.label} delay={(i + 1) * 70}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${social.label} — ${social.handle} (opens in a new tab)`}
                  className={cardClass}
                >
                  <span className={iconBadgeClass}>
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="mt-3 block text-sm font-semibold">{social.label}</span>
                  <span className="mt-1 block truncate text-sm text-ink-soft">
                    {social.handle}
                  </span>
                  {social.label === "WhatsApp" ? (
                    <span className="mt-3 inline-flex w-fit items-center rounded-full bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors group-hover:bg-brand-600">
                      Chat on WhatsApp
                    </span>
                  ) : (
                    <span className="mt-3 text-xs font-semibold text-brand-600 group-hover:underline">
                      Open profile
                    </span>
                  )}
                </a>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default ContactCards;
