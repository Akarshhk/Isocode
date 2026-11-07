import type { Metadata } from "next";
import { requireResident } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { flatStatement } from "@/lib/ledger";
import { formatINR } from "@/lib/money";
import { Card, CardHeader, LinkButton, PageHeader, Divider } from "@/components/ui";
import { BillsList, LedgerTable } from "@/components/statement-views";

export const metadata: Metadata = { title: "Dues" };

export default async function DuesPage() {
  const s = await requireResident();
  const [st, flat, config] = await Promise.all([
    flatStatement(prisma, s.flatId),
    prisma.flat.findUniqueOrThrow({ where: { id: s.flatId } }),
    prisma.billingConfig.findFirst({ orderBy: { effectiveFrom: "desc" } }),
  ]);
  const interest = st.accruedInterestPaise + st.interestChargedUnpaidPaise;

  return (
    <div className="space-y-4">
      <PageHeader title="Dues and receipts" sub={`${flat.code} · ${flat.areaSqft.toLocaleString("en-IN")} sq ft`} />

      <Card className="p-5">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-2">Maintenance outstanding</dt>
            <dd className="num">{formatINR(st.outstandingPrincipalPaise)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-2">Interest on late dues</dt>
            <dd className="num">{formatINR(interest)}</dd>
          </div>
          {st.advanceCreditPaise > 0 && (
            <div className="flex justify-between text-ok">
              <dt>Advance credit</dt>
              <dd className="num">−{formatINR(st.advanceCreditPaise)}</dd>
            </div>
          )}
          <Divider />
          <div className="flex justify-between pt-1 text-base font-semibold">
            <dt>Total to pay</dt>
            <dd className="num">{formatINR(st.totalDuePaise)}</dd>
          </div>
        </dl>
        {st.totalDuePaise > 0 && (
          <LinkButton href="/pay" size="lg" full className="mt-4">
            Pay {formatINR(st.totalDuePaise)}
          </LinkButton>
        )}
      </Card>

      <Card>
        <CardHeader title="Monthly bills" sub={config ? `${flat.areaSqft.toLocaleString("en-IN")} sq ft × ₹${(config.ratePaisePerSqft / 100).toFixed(2)} per sq ft` : undefined} />
        <div className="mt-2">
          <BillsList bills={st.bills} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Ledger" sub="Newest first" />
        <div className="mt-2 pb-2">
          <LedgerTable lines={st.lines} />
        </div>
      </Card>

      <p className="px-1 text-xs leading-relaxed text-ink-3">
        Late payments carry simple interest of {config ? config.interestBpsPerYear / 100 : 21}% a year on the overdue maintenance, counted daily
        after the due date, as set by the federation under its bye-laws. A payment first clears interest, then the oldest bill. Anything
        extra is kept as advance credit for your next bill.
      </p>
    </div>
  );
}
