import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "sm";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink hover:bg-brand-hover disabled:bg-ink-3",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "bg-surface text-danger border border-danger/30 hover:bg-danger-soft",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-lg gap-1.5",
  md: "h-11 px-4 text-[15px] rounded-xl gap-2",
  lg: "h-14 px-5 text-base rounded-2xl gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", full = false) {
  return cx(
    "inline-flex items-center justify-center font-medium transition-colors select-none disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
    full && "w-full",
  );
}

export function Button({
  variant = "primary",
  size = "md",
  full,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; full?: boolean }) {
  return <button className={cx(buttonClass(variant, size, full), className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  full,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; full?: boolean }) {
  return <Link className={cx(buttonClass(variant, size, full), className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function CardHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-ink-3">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "brand" | "ok" | "warn" | "danger" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  brand: "bg-brand-soft text-brand",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: Exclude<Tone, "neutral" | "brand">; title?: ReactNode; children?: ReactNode }) {
  const border: Record<string, string> = { ok: "border-ok/25", warn: "border-warn/25", danger: "border-danger/25", info: "border-info/20" };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-sm", tones[tone], border[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cx(title ? "mt-0.5" : "", "text-ink-2")}>{children}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 grid size-11 place-items-center rounded-full bg-sunken text-ink-3">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-3">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, action, back }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
          <span aria-hidden>←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-ink-3">{sub}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-sm text-danger">{error}</p> : hint ? <p className="mt-1.5 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "block w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "danger" | "ok" | "warn" }) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className={cx("num mt-1 text-2xl font-semibold tracking-tight", toneClass)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-sunken", className)} />;
}

export function Divider() {
  return <div className="h-px bg-line" />;
}
