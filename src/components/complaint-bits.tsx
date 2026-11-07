import { Pill } from "./ui";
import { CATEGORY_LABEL, URGENCY_LABEL, type CategoryT, type UrgencyT } from "@/lib/complaints/rules";
import { formatDateTime } from "@/lib/dates";
import { ShieldAlert, Sparkles, Link2 } from "lucide-react";

export const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function StatusPill({ status }: { status: string }) {
  const tone = status === "CLOSED" ? "neutral" : status === "RESOLVED" ? "ok" : status === "IN_PROGRESS" ? "info" : "warn";
  return <Pill tone={tone}>{STATUS_LABEL[status] ?? status}</Pill>;
}

export function UrgencyPill({ urgency }: { urgency: UrgencyT }) {
  const tone = urgency === "CRITICAL" ? "danger" : urgency === "HIGH" ? "warn" : "neutral";
  return <Pill tone={tone}>{URGENCY_LABEL[urgency]}</Pill>;
}

export function CategoryText({ category }: { category: CategoryT }) {
  return <>{CATEGORY_LABEL[category]}</>;
}

export function SafetyBadge({ keyword }: { keyword: string }) {
  return (
    <Pill tone="danger">
      <ShieldAlert size={12} aria-hidden /> Safety: {keyword}
    </Pill>
  );
}

export function ReviewBadge() {
  return (
    <Pill tone="warn">
      <Sparkles size={12} aria-hidden /> Check category
    </Pill>
  );
}

export function LinkedBadge({ count }: { count: number }) {
  return (
    <Pill tone="info">
      <Link2 size={12} aria-hidden /> +{count} linked
    </Pill>
  );
}

export type TimelineEvent = { id: string; type: string; message: string; at: Date; actorName: string | null };

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-4 pl-5 before:absolute before:bottom-1 before:left-[5px] before:top-1 before:w-px before:bg-line">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={`absolute -left-5 top-1.5 size-[11px] rounded-full border-2 border-surface ${
              e.type === "SAFETY_ESCALATED" ? "bg-danger" : e.type === "REOPENED" ? "bg-warn" : e.type === "RATED" || e.message.includes("resolved") ? "bg-ok" : "bg-line-strong"
            }`}
            aria-hidden
          />
          <p className="text-sm text-ink">{e.message}</p>
          <p className="text-xs text-ink-3">
            {formatDateTime(e.at)}
            {e.actorName ? ` · ${e.actorName}` : " · System"}
          </p>
        </li>
      ))}
    </ol>
  );
}
