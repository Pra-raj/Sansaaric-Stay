import type { Metadata } from "next";
import { ContactHero } from "@/components/contact/ContactHero";
import { ContactCards } from "@/components/contact/ContactCards";
import { ContactForm } from "@/components/contact/ContactForm";
import { ContactFaq } from "@/components/contact/ContactFaq";
import Reveal from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Call, message on WhatsApp or follow Sansaaric Stay. Ask about a stay, a booking or listing your property in Nepal.",
};

export default function ContactPage() {
  return (
    <div>
      <ContactHero />
      <ContactCards />

      <section className="pb-16 pt-10 sm:pb-20">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 lg:grid-cols-2">
          <Reveal>
            <div className="rounded-card border border-border bg-surface p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold tracking-tight">Send us a message</h2>
              <p className="mb-5 mt-1 text-sm text-ink-soft">
                Tell us what you need. We&apos;ll continue the conversation on WhatsApp.
              </p>
              <ContactForm />
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div>
              <h2 className="mb-1 text-xl font-semibold tracking-tight">
                Questions guests ask
              </h2>
              <p className="mb-5 text-sm text-ink-soft">A few quick answers.</p>
              <ContactFaq />
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
