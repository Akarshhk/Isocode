import "server-only";
import { prisma } from "@/lib/db";
import { allStatements } from "@/lib/ledger";
import { ageingBucket } from "@/lib/billing";
import { todayIST } from "@/lib/dates";
import { CATEGORIES, RESPONSE_MINUTES, type CategoryT } from "@/lib/complaints/rules";

export const BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;

export type PeriodRow = { period: string; billedPaise: number; collectedPaise: number; bills: number; onTime: number; due: boolean };

/** Every number on the committee report, computed from the ledger and complaint records. */
export async function committeeReport(periodParam?: string) {
  const today = todayIST();
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [statements, flats, complaints, lines] = await Promise.all([
    allStatements(prisma, today),
    prisma.flat.findMany({ select: { id: true, code: true, areaSqft: true } }),
    prisma.complaint.findMany({
      where: { createdAt: { gte: since } },
      select: { category: true, urgency: true, status: true, createdAt: true, firstResponseAt: true, resolvedAt: true, reopenCount: true, classifiedBy: true, aiCategory: true, safetyKeyword: true, duplicateOfId: true, responseDueAt: true },
    }),
    prisma.bankLine.findMany({ where: { import: { createdAt: { gte: since } } }, select: { status: true, amountPaise: true, resolvedAt: true, import: { select: { createdAt: true } } } }),
  ]);

  // ---- collections by billing month ----
  const byPeriod = new Map<string, PeriodRow>();
  for (const st of statements.values()) {
    for (const b of st.bills) {
      const row = byPeriod.get(b.period) ?? { period: b.period, billedPaise: 0, collectedPaise: 0, bills: 0, onTime: 0, due: false };
      row.billedPaise += b.amountPaise;
      row.collectedPaise += b.paidPaise;
      row.bills += 1;
      if (b.dueOn < today) row.due = true;
      if (b.paidOffOn && b.paidOffOn <= b.dueOn) row.onTime += 1;
      byPeriod.set(b.period, row);
    }
  }
  const periods = [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
  const current = periods.find((p) => p.period === periodParam) ?? [...periods].reverse().find((p) => p.due) ?? periods.at(-1);

  // ---- dues ageing ----
  const ageing = BUCKETS.map((b) => ({ bucket: b, paise: 0, flats: new Set<string>() }));
  let interestPaise = 0;
  let outstandingPaise = 0;
  const overdueFlats: { code: string; days: number; duePaise: number }[] = [];
  const codeOf = new Map(flats.map((f) => [f.id, f.code]));
  for (const [flatId, st] of statements) {
    outstandingPaise += st.totalDuePaise;
    interestPaise += st.accruedInterestPaise + st.interestChargedUnpaidPaise;
    for (const b of st.bills) {
      if (b.daysOverdue > 0 && b.remainingPaise > 0) {
        const slot = ageing[BUCKETS.indexOf(ageingBucket(b.daysOverdue))];
        slot.paise += b.remainingPaise;
        slot.flats.add(flatId);
      }
    }
    if (st.oldestOverdueDays > 0) overdueFlats.push({ code: codeOf.get(flatId)!, days: st.oldestOverdueDays, duePaise: st.totalDuePaise });
  }
  overdueFlats.sort((a, b) => b.days - a.days || b.duePaise - a.duePaise);

  // ---- complaints, last 30 days ----
  const responded = complaints.filter((c) => c.firstResponseAt);
  const avgResponseMin = responded.length ? responded.reduce((s, c) => s + (c.firstResponseAt!.getTime() - c.createdAt.getTime()) / 60_000, 0) / responded.length : null;
  const withinTarget = responded.filter((c) => c.firstResponseAt!.getTime() - c.createdAt.getTime() <= RESPONSE_MINUTES[c.urgency] * 60_000).length;
  const fixed = complaints.filter((c) => c.resolvedAt);
  const avgResolveHours = fixed.length ? fixed.reduce((s, c) => s + (c.resolvedAt!.getTime() - c.createdAt.getTime()) / 3_600_000, 0) / fixed.length : null;
  const finished = complaints.filter((c) => c.status === "RESOLVED" || c.status === "CLOSED" || c.reopenCount > 0);
  const reopened = finished.filter((c) => c.reopenCount > 0).length;
  const aiClassified = complaints.filter((c) => c.classifiedBy === "AI" && c.aiCategory);
  const aiOverridden = aiClassified.filter((c) => c.aiCategory !== c.category).length;
  const byCategory = CATEGORIES.map((cat) => ({ category: cat as CategoryT, count: complaints.filter((c) => c.category === cat && !c.duplicateOfId).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  // ---- bank matching, last 30 days ----
  const credits = lines.filter((l) => l.amountPaise > 0 && l.status !== "DUPLICATE" && l.status !== "ALREADY_POSTED");
  const auto = credits.filter((l) => l.status === "AUTO_POSTED").length;
  const queueWaits = lines
    .filter((l) => l.status === "RESOLVED" && l.resolvedAt)
    .map((l) => (l.resolvedAt!.getTime() - l.import.createdAt.getTime()) / 3_600_000)
    .sort((a, b) => a - b);
  const queuedNow = await prisma.bankLine.count({ where: { status: "QUEUED" } });

  return {
    asOf: now,
    today,
    periods,
    current,
    outstandingPaise,
    interestPaise,
    overdueFlatCount: overdueFlats.length,
    flatCount: flats.length,
    ageing: ageing.map((a) => ({ bucket: a.bucket, paise: a.paise, flats: a.flats.size })),
    topOverdue: overdueFlats.slice(0, 8),
    complaints: {
      total: complaints.filter((c) => !c.duplicateOfId).length,
      reports: complaints.length,
      openNow: complaints.filter((c) => c.status === "ASSIGNED" || c.status === "IN_PROGRESS").length,
      avgResponseMin,
      withinTargetPct: responded.length ? (withinTarget / responded.length) * 100 : null,
      avgResolveHours,
      reopenRatePct: finished.length ? (reopened / finished.length) * 100 : null,
      aiOverridePct: aiClassified.length ? (aiOverridden / aiClassified.length) * 100 : null,
      aiCount: aiClassified.length,
      safety: complaints.filter((c) => c.safetyKeyword).length,
      byCategory,
    },
    matching: {
      credits: credits.length,
      autoPct: credits.length ? (auto / credits.length) * 100 : null,
      alreadyPosted: lines.filter((l) => l.status === "ALREADY_POSTED").length,
      resolved: credits.filter((l) => l.status === "RESOLVED").length,
      queuedNow,
      medianQueueHours: queueWaits.length ? queueWaits[Math.floor(queueWaits.length / 2)] : null,
    },
  };
}
