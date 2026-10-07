import { ReactNode } from "react";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-ink/5 text-ink-soft",
  brand: "bg-brand-50 text-brand-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
};

const outlineClasses: Record<Tone, string> = {
  neutral: "border-border bg-transparent text-ink-soft",
  brand: "border-brand-500/40 bg-transparent text-brand-600",
  success: "border-emerald-300 bg-transparent text-emerald-700",
  warning: "border-amber-300 bg-transparent text-amber-700",
  danger: "border-red-300 bg-transparent text-red-700",
};

export function Badge({
  children,
  tone = "neutral",
  outline = false,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  /** Bordered, transparent pill — the look the docadmin templates use. */
  outline?: boolean;
  className?: string;
}) {
  const colors = outline ? outlineClasses[tone] : toneClasses[tone];
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${colors} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
