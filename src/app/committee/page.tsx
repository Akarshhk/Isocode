import type { Metadata } from "next";
import Link from "next/link";
import { Download, ShieldAlert } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { committeeReport } from "@/lib/report";
import { Card, CardHeader, Pill, Stat, cx } from "@/components/ui";
import { HBarList, Meter, PctColumns } from "@/components/charts";
import { formatINR } from "@/lib/money";
import { formatDateTime, periodLabel } from "@/lib/dates";
import { CATEGORY_LABEL } from "@/lib/complaints/rules";

export const metadata: Metadata = { title: "Committee report" };

const lakh = (paise: number) => `₹${(paise / 100 / 100_000).toFixed(2)} L`;
const pct = (n: number | null, d = 0) => (n == null ? "—" : `${n.toFixed(d)}%`);
const hrs = (h: number | null) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);

export default async function CommitteePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireRole("COMMITTEE", "STAFF");
  const { period } = await searchParams;
  const r = await committeeReport(period);
  const cur = r.current;
  const collectedPct = cur && cur.billedPaise ? (cur.collectedPaise / cur.billedPaise) * 100 : 0;
  const onTimePct = cur && cur.bills ? (cur.onTime / cur.bills) * 100 : 0;
  const c = r.complaints;
  const m = r.matching;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Monthly report{cur ? `: ${periodLabel(cur.period)}` : ""}</h1>
          <p className="mt-0.5 text-sm text-ink-3">
            Computed from the ledger as of {formatDateTime(r.asOf)}. Credits waiting in the accounts queue are not counted as collected.
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <nav aria-label="Billing month" className="flex gap-1">
            {r.periods.map((p) => (
              <Link
                key={p.period}
                href={`/committee?period=${p.period}`}
                className={cx("rounded-lg px-2.5 py-1.5 text-sm", cur?.period === p.period ? "bg-ink text-white" : "text-ink-2 hover:bg-sunken")}
              >
                {periodLabel(p.period).slice(0, 3)}
              </Link>
            ))}
          </nav>
          <a href="/committee/report.csv" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-sunken">
            <Download size={15} /> Dues CSV
          </a>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <Stat label={`Billed for ${cur ? periodLabel(cur.period).split(" ")[0] : "month"}`} value={formatINR(cur?.billedPaise ?? 0)} sub={`${cur?.bills ?? 0} flats`} />
        </Card>
        <Card className="p-4">
          <Stat label="Collected so far" value={pct(collectedPct)} sub={`${formatINR(cur?.collectedPaise ?? 0)} of ${formatINR(cur?.billedPaise ?? 0)}`} />
          <Meter pct={collectedPct} />
        </Card>
        <Card className="p-4">
          <Stat label="Paid by the due date" value={cur?.due ? pct(onTimePct) : "Not due yet"} sub="Target 90% (from 70% today)" />
          {cur?.due && <Meter pct={onTimePct} target={90} />}
        </Card>
        <Card className="p-4">
          <Stat label="Outstanding, all months" value={lakh(r.outstandingPaise)} sub={`${r.overdueFlatCount} of ${r.flatCount} flats overdue · incl. ${formatINR(r.interestPaise)} interest`} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="pb-5">
          <CardHeader title="Dues ageing" sub="Unpaid maintenance by days past the due date" />
          <div className="mt-5 px-4 sm:px-5">
            <HBarList
              unit="Dues ageing"
              rows={r.ageing.map((a) => ({
                label: `${a.bucket} days`,
                value: a.paise,
                display: formatINR(a.paise),
                sub: `${a.flats} flat${a.flats === 1 ? "" : "s"}`,
                tip: `${a.bucket} days overdue: ${formatINR(a.paise)} across ${a.flats} flats`,
              }))}
            />
          </div>
        </Card>

        <Card className="pb-4">
          <CardHeader title="Bills paid by the due date" sub="Share of each month's bills fully paid on time" />
          <div className="mt-3 px-4 sm:px-5">
            <PctColumns
              target={90}
              targetLabel="Target 90%"
              points={r.periods.map((p) => ({
                label: periodLabel(p.period).slice(0, 3),
                pct: p.due ? (p.onTime / p.bills) * 100 : null,
                tip: `${periodLabel(p.period)}: ${p.onTime} of ${p.bills} paid on time; ${formatINR(p.collectedPaise)} collected of ${formatINR(p.billedPaise)}`,
              }))}
            />
          </div>
          <table className="mx-4 mt-2 w-[calc(100%-2rem)] text-xs sm:mx-5 sm:w-[calc(100%-2.5rem)]">
            <caption className="sr-only">Collections by month</caption>
            <thead>
              <tr className="text-left text-ink-3">
                <th className="py-1 font-medium">Month</th>
                <th className="py-1 text-right font-medium">Billed</th>
                <th className="py-1 text-right font-medium">Collected</th>
                <th className="py-1 text-right font-medium">On time</th>
              </tr>
            </thead>
            <tbody className="num divide-y divide-line">
              {r.periods.map((p) => (
                <tr key={p.period}>
                  <td className="py-1">{periodLabel(p.period)}</td>
                  <td className="py-1 text-right">{formatINR(p.billedPaise)}</td>
                  <td className="py-1 text-right">{pct(p.billedPaise ? (p.collectedPaise / p.billedPaise) * 100 : null)}</td>
                  <td className="py-1 text-right">{p.due ? `${p.onTime}/${p.bills}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-[15px] font-semibold">Complaints, last 30 days</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <Stat label="First response" value={c.avgResponseMin == null ? "—" : hrs(c.avgResponseMin / 60)} sub={`${pct(c.withinTargetPct)} within target`} />
          </Card>
          <Card className="p-4">
            <Stat label="Time to resolve" value={hrs(c.avgResolveHours)} sub={`Average · ${c.openNow} open now`} />
          </Card>
          <Card className="p-4">
            <Stat label="Reopened" value={pct(c.reopenRatePct)} tone={c.reopenRatePct != null && c.reopenRatePct > 8 ? "warn" : "ok"} sub="Target under 8% (from 25%)" />
          </Card>
          <Card className="p-4">
            <Stat label="AI category changed" value={pct(c.aiOverridePct)} sub={`By the help desk, of ${c.aiCount} AI-sorted`} />
          </Card>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="pb-5">
          <CardHeader
            title="Issues by category"
            sub={`${c.total} issues from ${c.reports} reports (linked duplicates counted once)`}
            action={
              c.safety > 0 ? (
                <Pill tone="danger">
                  <ShieldAlert size={12} /> {c.safety} safety escalation{c.safety > 1 ? "s" : ""}
                </Pill>
              ) : undefined
            }
          />
          <div className="mt-5 px-4 sm:px-5">
            <HBarList
              unit="Issues by category"
              rows={c.byCategory.map((x) => ({ label: CATEGORY_LABEL[x.category], value: x.count, display: String(x.count), tip: `${CATEGORY_LABEL[x.category]}: ${x.count} issues` }))}
            />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Payment matching, last 30 days</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Matched automatically" value={pct(m.autoPct)} sub={`of ${m.credits} new credits`} />
              <Stat label="Posted by staff" value={String(m.resolved)} sub={`median ${hrs(m.medianQueueHours)} in queue`} />
              <Stat label="Waiting in queue" value={String(m.queuedNow)} tone={m.queuedNow > 0 ? "warn" : undefined} sub="never auto-posted" />
              <Stat label="Double posts blocked" value={String(m.alreadyPosted)} sub="already on ledger" />
            </div>
          </Card>

          <Card>
            <CardHeader title="Longest overdue" sub="Flat codes only; names stay with the help desk" />
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="px-4 py-2 font-medium sm:px-5">Flat</th>
                  <th className="px-2 py-2 text-right font-medium">Overdue</th>
                  <th className="px-4 py-2 text-right font-medium sm:px-5">Due now</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-line">
                {r.topOverdue.map((f) => (
                  <tr key={f.code}>
                    <td className="px-4 py-2 sm:px-5">{f.code}</td>
                    <td className="px-2 py-2 text-right">{f.days} days</td>
                    <td className="px-4 py-2 text-right sm:px-5">{formatINR(f.duePaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink-3">
        How these are counted: a bill is &ldquo;on time&rdquo; when payments cleared it in full by its due date. Payments clear interest first, then the oldest
        bill. Response time runs from a complaint being raised to the first status change or note by staff. Reopen rate is the share of resolved complaints that a
        resident reopened.
      </p>
    </div>
  );
}
