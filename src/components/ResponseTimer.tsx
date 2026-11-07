"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

function fmt(ms: number) {
  const m = Math.round(Math.abs(ms) / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Live countdown to the first-response deadline. Shows how long it took once someone responded. */
export function ResponseTimer({ dueAt, respondedAt, createdAt, compact }: { dueAt: string; respondedAt: string | null; createdAt: string; compact?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const due = new Date(dueAt).getTime();
  if (respondedAt) {
    const took = new Date(respondedAt).getTime() - new Date(createdAt).getTime();
    const late = new Date(respondedAt).getTime() > due;
    return (
      <span className={`num inline-flex items-center gap-1 text-xs ${late ? "text-warn" : "text-ink-3"}`}>
        <Timer size={12} aria-hidden /> {compact ? "" : "Responded in "}
        {fmt(took)}
        {late ? " (late)" : ""}
      </span>
    );
  }
  if (now === null) return <span className="text-xs text-ink-3">&nbsp;</span>;
  const left = due - now;
  return (
    <span className={`num inline-flex items-center gap-1 text-xs font-medium ${left < 0 ? "text-danger" : left < 30 * 60_000 ? "text-warn" : "text-ink-2"}`}>
      <Timer size={12} aria-hidden />
      {left < 0 ? `Response overdue ${fmt(left)}` : `${compact ? "" : "Response due in "}${fmt(left)}`}
    </span>
  );
}
