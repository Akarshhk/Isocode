import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { GenerateForm } from "./GenerateForm";
import { formatINR } from "@/lib/money";
import { formatDate, nextPeriod, periodLabel, periodOf, todayIST } from "@/lib/dates";
import { allStatements } from "@/lib/ledger";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  await requireRole("STAFF");
  const [config, periods, flatCount, statements] = await Promise.all([
    prisma.billingConfig.findFirst({ orderBy: { effectiveFrom: "desc" } }),
    prisma.bill.groupBy({ by: ["period"], _sum: { amountPaise: true }, _count: true, orderBy: { period: "desc" } }),
    prisma.flat.count(),
    allStatements(prisma),
  ]);
  const latest = periods[0]?.period;
  const next = latest ? nextPeriod(latest) : periodOf(todayIST());
  const collected = new Map<string, number>();
  for (const st of statements.values()) for (const b of st.bills) collected.set(b.period, (collected.get(b.period) ?? 0) + b.paidPaise);

  return (
    <div>
      <PageHeader title="Billing" sub="Monthly maintenance by flat area. Late interest follows the federation's bye-laws." />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Bills issued" />
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="px-4 py-2 font-medium sm:px-5">Month</th>
                  <th className="px-2 py-2 text-right font-medium">Flats</th>
                  <th className="px-2 py-2 text-right font-medium">Billed</th>
                  <th className="px-2 py-2 text-right font-medium">Collected</th>
                  <th className="px-4 py-2 text-right font-medium sm:px-5">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {periods.map((p) => {
                  const billed = p._sum.amountPaise ?? 0;
                  const got = collected.get(p.period) ?? 0;
                  return (
                    <tr key={p.period}>
                      <td className="px-4 py-2.5 sm:px-5">{periodLabel(p.period)}</td>
                      <td className="num px-2 py-2.5 text-right">{p._count}</td>
                      <td className="num px-2 py-2.5 text-right">{formatINR(billed)}</td>
                      <td className="num px-2 py-2.5 text-right">{formatINR(got)}</td>
                      <td className="num px-4 py-2.5 text-right text-ink-2 sm:px-5">{billed ? Math.round((got / billed) * 100) : 0}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-[15px] font-semibold">Rules in effect</h2>
            {config && (
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Rate" value={`₹${(config.ratePaisePerSqft / 100).toFixed(2)}`} sub="per sq ft a month" />
                <Stat label="Interest" value={`${config.interestBpsPerYear / 100}%`} sub="a year, simple" />
                <Stat label="Due" value={`${config.dueDay}th`} sub="of the month" />
              </div>
            )}
            {config && <p className="mt-3 text-xs text-ink-3">Since {formatDate(config.effectiveFrom)}. Each bill keeps the rate it was issued with.</p>}
          </Card>
          <Card className="p-4">
            <h2 className="mb-1 text-[15px] font-semibold">Next billing run</h2>
            <p className="mb-3 text-sm text-ink-3">
              {periodLabel(next)}: due {config ? `${config.dueDay} ${periodLabel(next).split(" ")[0]}` : ""}. Interest on arrears keeps accruing daily on the ledger.
            </p>
            <GenerateForm period={next} label={periodLabel(next)} flats={flatCount} />
          </Card>
        </div>
      </div>
    </div>
  );
}
