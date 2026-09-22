import { ReactNode } from "react";

type Tone = "neutral" | "brand" | "success" | "warning";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-ink/5 text-ink-soft",
  brand: "bg-brand-50 text-brand-600",
  success: "bg-emerald-50 text-emerald-700",
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
