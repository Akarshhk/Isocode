import { Pill } from "./ui";

export const LINE_STATUS: Record<string, { label: string; tone: "ok" | "info" | "warn" | "neutral" | "danger" | "brand" }> = {
  AUTO_POSTED: { label: "Posted automatically", tone: "ok" },
  ALREADY_POSTED: { label: "Already on ledger", tone: "info" },
  QUEUED: { label: "In accounts queue", tone: "warn" },
  RESOLVED: { label: "Posted by staff", tone: "brand" },
  IGNORED: { label: "Ignored", tone: "neutral" },
  DUPLICATE: { label: "Duplicate", tone: "neutral" },
};

export function LineStatusPill({ status }: { status: string }) {
  const s = LINE_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}
