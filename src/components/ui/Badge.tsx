import { ReactNode } from "react";

type Tone = "neutral" | "brand" | "success" | "warning";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-blac/5  text-ink-soft",
  brand: "bg-brnad-500 text-brand-600",
  success: "bg-emerals-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
