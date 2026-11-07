import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Inbox } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { LinkedBadge, ReviewBadge, SafetyBadge, StatusPill, UrgencyPill } from "@/components/complaint-bits";
import { ResponseTimer } from "@/components/ResponseTimer";
import { CATEGORY_LABEL } from "@/lib/complaints/rules";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Complaints" };

const VIEWS = {
  open: { label: "Open", where: { status: { in: ["ASSIGNED", "IN_PROGRESS"] }, duplicateOfId: null } },
  review: { label: "Check category", where: { needsReview: true, status: { not: "CLOSED" } } },
  critical: { label: "Critical", where: { urgency: "CRITICAL", status: { in: ["ASSIGNED", "IN_PROGRESS"] }, duplicateOfId: null } },
  resolved: { label: "Awaiting resident", where: { status: "RESOLVED" } },
  all: { label: "All", where: {} },
} satisfies Record<string, { label: string; where: Prisma.ComplaintWhereInput }>;
type View = keyof typeof VIEWS;

const URGENCY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

export default async function DeskQueue({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireRole("STAFF");
  const { view: v } = await searchParams;
  const view: View = v && v in VIEWS ? (v as View) : "open";

  const [items, counts] = await Promise.all([
    prisma.complaint.findMany({
      where: VIEWS[view].where,
      include: { flat: { select: { code: true } }, assignee: { select: { name: true } }, _count: { select: { duplicates: true } } },
      orderBy: view === "all" || view === "resolved" ? { createdAt: "desc" } : { responseDueAt: "asc" },
      take: 100,
    }),
    Promise.all((Object.keys(VIEWS) as View[]).map((k) => (k === "all" ? Promise.resolve(0) : prisma.complaint.count({ where: VIEWS[k].where })))),
  ]);
  const sorted = view === "open" || view === "critical" ? [...items].sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]) : items;

  return (
    <div>
      <PageHeader title="Complaints" sub="Most urgent first. Reports of the same common-area issue are grouped under the first one." />
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {(Object.keys(VIEWS) as View[]).map((k, i) => (
          <Link
            key={k}
            href={k === "open" ? "/desk" : `/desk?view=${k}`}
            className={cx(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
              view === k ? "bg-ink text-white" : "text-ink-2 hover:bg-sunken",
            )}
          >
            {VIEWS[k].label}
            {k !== "all" && <span className={cx("num text-xs", view === k ? "text-white/70" : "text-ink-3")}>{counts[i]}</span>}
          </Link>
        ))}
      </div>

      <Card>
        {sorted.length === 0 ? (
          <EmptyState icon={<Inbox size={20} />} title="Nothing here">
            {view === "review" ? "Every AI category has been confirmed." : "No complaints in this view."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {sorted.map((c) => (
              <li key={c.id}>
                <Link href={`/desk/complaints/${c.id}`} className="grid gap-x-4 gap-y-1 px-4 py-3 hover:bg-sunken/60 sm:grid-cols-[96px_1fr_auto] sm:px-5">
                  <div className="flex items-center gap-1.5 sm:block">
                    <UrgencyPill urgency={c.urgency} />
                    <p className="num text-xs text-ink-3 sm:mt-1">#{c.number}</p>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{CATEGORY_LABEL[c.category]}</span>
                      <span className="num text-sm text-ink-3">{c.flat.code}</span>
                      {c.safetyKeyword && <SafetyBadge keyword={c.safetyKeyword} />}
                      {c.needsReview && <ReviewBadge />}
                      {c._count.duplicates > 0 && <LinkedBadge count={c._count.duplicates} />}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-2">{c.description}</p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {c.assignee?.name ?? "Unassigned"} · {formatDateTime(c.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:justify-center">
                    <StatusPill status={c.status} />
                    {(c.status === "ASSIGNED" || c.status === "IN_PROGRESS") && (
                      <ResponseTimer compact dueAt={c.responseDueAt.toISOString()} respondedAt={c.firstResponseAt?.toISOString() ?? null} createdAt={c.createdAt.toISOString()} />
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
