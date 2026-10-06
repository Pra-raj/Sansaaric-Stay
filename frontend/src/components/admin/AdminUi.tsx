import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

/** Shared building blocks so every admin page looks the same. */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <div className="mr-auto min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
  bodyClassName = "p-5",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`rounded-card border border-border/20 bg-surface shadow-sm ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-border/20 px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-xs font-semibold text-brand-600 hover:underline">
      {children}
    </Link>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  hint,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Percent change vs the previous period; null/undefined hides it. */
  delta?: number | null;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-border/20 bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-ink-soft">{label}</p>
        <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon aria-hidden className="size-[18px]" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        {delta != null && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${
              delta === 0
                ? "bg-bg text-ink-soft"
                : delta > 0
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
            }`}
          >
            {delta > 0 && <ArrowUpRight aria-hidden className="size-3" />}
            {delta < 0 && <ArrowDownRight aria-hidden className="size-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-ink-soft">{hint}</span>}
      </div>
    </div>
  );
}
