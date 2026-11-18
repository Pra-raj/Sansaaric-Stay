"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { WHATSAPP_HREF } from "@/lib/social-links";

interface FormErrors {
  name?: string;
  message?: string;
}

const NAME_MAX = 80;
const MESSAGE_MAX = 2000;

/**
 * No backend call: the message is opened in WhatsApp with the text already
 * filled in, so the guest can review it before sending.
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanMessage = message.trim();
    const next: FormErrors = {};

    if (cleanName.length < 2) {
      next.name = "Please enter your name (at least 2 characters).";
    }
    if (cleanMessage.length < 10) {
      next.message = "Please write at least 10 characters so we can help.";
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const text = `Hi Sansaaric Stay, I'm ${cleanName}. ${cleanMessage}`;
    window.open(
      `${WHATSAPP_HREF}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-1">
        <Input
          id="contact-name"
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          autoComplete="name"
          error={!!errors.name}
          aria-describedby={errors.name ? "contact-name-error" : undefined}
        />
        {errors.name && (
          <p id="contact-name-error" role="alert" className="text-xs text-red-600">
            {errors.name}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="contact-message"
          className="text-xs font-semibold uppercase tracking-wide text-ink-soft"
        >
          Message
        </label>
        <textarea
          id="contact-message"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MESSAGE_MAX}
          aria-describedby={errors.message ? "contact-message-error" : undefined}
          aria-invalid={errors.message ? true : undefined}
          className={`w-full rounded-lg border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none ${
            errors.message
              ? "border-red-500 focus:border-red-500"
              : "border-border focus:border-brand-500"
          }`}
        />
        {errors.message && (
          <p id="contact-message-error" role="alert" className="text-xs text-red-600">
            {errors.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" className="self-start">
          <Send aria-hidden className="size-4" />
          Send on WhatsApp
        </Button>
        <p className="text-xs text-ink-soft">Opens WhatsApp with your message.</p>
      </div>
    </form>
  );
}

export default ContactForm;
