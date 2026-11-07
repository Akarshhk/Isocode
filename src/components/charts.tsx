import type { ReactNode } from "react";

// Small, dependency-free charts. Bars are capped at 20px, grow from one baseline with a 4px
// rounded data end, carry their value as text in ink colours, and show a tooltip on hover.

export function HBarList({ rows, max, unit }: { rows: { label: ReactNode; value: number; display: string; sub?: string; tip: string }[]; max?: number; unit?: string }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3" aria-label={unit}>
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[88px_1fr] items-center gap-3 sm:grid-cols-[120px_1fr]">
          <span className="truncate text-sm text-ink-2">{r.label}</span>
          <div className="flex items-center gap-2.5" title={r.tip}>
            <div className="h-5 min-w-0 flex-1">
              <div
                className="h-full rounded-r bg-brand transition-[width]"
                style={{ width: `${r.value > 0 ? Math.max(1.5, (r.value / top) * 100) : 0}%` }}
              />
            </div>
            <span className="num w-28 shrink-0 text-right text-sm">
              <span className="font-medium text-ink">{r.display}</span>
              {r.sub && <span className="block text-xs text-ink-3">{r.sub}</span>}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Percentage columns with a dashed target line. Single series: the title names it, no legend. */
export function PctColumns({ points, target, targetLabel }: { points: { label: string; pct: number | null; tip: string }[]; target?: number; targetLabel?: string }) {
  const H = 150;
  return (
    <div className="relative" style={{ height: H + 44 }}>
      <div className="absolute inset-x-0 top-5 border-b border-line-strong" style={{ height: H }}>
        {[25, 50, 75, 100].map((g) => (
          <div key={g} className="absolute inset-x-0 border-t border-line/70" style={{ bottom: (g / 100) * H }} aria-hidden />
        ))}
        {target != null && (
          <div className="absolute inset-x-0 border-t-2 border-dashed border-ink-3" style={{ bottom: (target / 100) * H }}>
            <span className="absolute -top-5 right-0 bg-surface pl-1 text-xs text-ink-3">{targetLabel}</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end justify-around px-2">
          {points.map((p) => (
            <div key={p.label} className="flex w-12 flex-col items-center justify-end" style={{ height: H }} title={p.tip}>
              <span className="num mb-1 text-xs font-medium text-ink">{p.pct == null ? "—" : `${Math.round(p.pct)}%`}</span>
              <div className="w-5 rounded-t bg-brand" style={{ height: p.pct == null ? 0 : Math.max(2, (p.pct / 100) * H - 18) }} />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-around px-2">
        {points.map((p) => (
          <span key={p.label} className="w-12 text-center text-xs text-ink-3">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Thin progress meter for a single share (stat tile). */
export function Meter({ pct, target }: { pct: number; target?: number }) {
  return (
    <div className="relative mt-3 h-2 rounded-full bg-sunken" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, pct)}%` }} />
      {target != null && <div className="absolute -top-1 h-4 w-0.5 rounded bg-ink-2" style={{ left: `${target}%` }} title={`Target ${target}%`} />}
    </div>
  );
}
