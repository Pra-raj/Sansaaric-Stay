import { compactNumber, formatCurrency, formatMonth } from "@/lib/admin-utils";
import type { RevenueMonth } from "@/types";

function niceMax(v: number): number {
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Bar chart with gridlines and axis labels. Hover a bar for the exact amount. */
export function RevenueChart({ months, height = 260 }: { months: RevenueMonth[]; height?: number }) {
  const W = 720;
  const pad = { top: 12, right: 12, bottom: 30, left: 44 };
  const max = niceMax(Math.max(...months.map((m) => m.revenue), 1));
  const plotH = height - pad.top - pad.bottom;
  const slot = (W - pad.left - pad.right) / months.length;
  const barW = Math.min(44, slot * 0.55);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Revenue by month" className="h-auto w-full">
      {ticks.map((t) => {
        const y = pad.top + plotH * (1 - t);
        return (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} className="stroke-ink/10" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={pad.left - 8} y={y + 4} textAnchor="end" className="fill-ink-soft text-[11px]">
              {compactNumber(max * t)}
            </text>
          </g>
        );
      })}
      {months.map((m, i) => {
        const h = (plotH * m.revenue) / max;
        const x = pad.left + i * slot + (slot - barW) / 2;
        return (
          <g key={m.month}>
            <rect x={x} y={pad.top + plotH - h} width={barW} height={h} rx={5} className="fill-brand-500 hover:fill-brand-600">
              <title>{`${formatMonth(m.month)}: ${formatCurrency(m.revenue)} from ${m.bookings} bookings`}</title>
            </rect>
            <text x={x + barW / 2} y={height - 10} textAnchor="middle" className="fill-ink-soft text-[11px]">
              {formatMonth(m.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
