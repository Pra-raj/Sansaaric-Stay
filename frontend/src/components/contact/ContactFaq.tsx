"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "How do I book a stay?",
    answer:
      "Find a stay in Search, open its page, choose your dates and a room, then complete the booking form. Your booking then appears under Bookings in your account.",
  },
  {
    question: "How do I leave a review?",
    answer:
      "Reviews open after your stay has ended. While signed in, open the stay's page or My reviews in your account and share your rating and comment.",
  },
  {
    question: "How do I contact a host or Sansaaric Stay?",
    answer:
      "Message us on WhatsApp or call the number on this page and we'll help you reach the host.",
  },
  {
    question: "How do I list my property?",
    answer:
      "Get in touch with us using any of the options above and tell us about your homestay, hotel or resort. We'll take it from there.",
  },
];

/** Animated, keyboard-accessible FAQ accordion. */
export function ContactFaq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-border/60 rounded-card border border-border bg-surface shadow-sm">
      {faqs.map((faq, i) => {
        const expanded = open === i;
        const panelId = `faq-panel-${i}`;
        const buttonId = `faq-button-${i}`;
        return (
          <div key={faq.question}>
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : i)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left text-sm font-semibold text-ink hover:bg-bg/60 sm:px-5"
              >
                <span>{faq.question}</span>
                <ChevronDown
                  aria-hidden
                  className={`size-4 shrink-0 text-ink-soft transition-transform duration-300 motion-reduce:transition-none ${
                    expanded ? "rotate-180" : ""
                  }`}
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-4 pb-4 text-sm leading-relaxed text-ink-soft sm:px-5">
                  {faq.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ContactFaq;
