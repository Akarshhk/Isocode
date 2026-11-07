import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { requireResident } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { flatStatement } from "@/lib/ledger";
import { formatINR } from "@/lib/money";
import { Card, PageHeader, Pill } from "@/components/ui";
import { PayForm } from "./PayForm";
import { FlaskConical } from "lucide-react";

export const metadata: Metadata = { title: "Pay" };

export default async function PayPage() {
  const s = await requireResident();
  const [st, flat] = await Promise.all([flatStatement(prisma, s.flatId), prisma.flat.findUniqueOrThrow({ where: { id: s.flatId } })]);
  const interest = st.accruedInterestPaise + st.interestChargedUnpaidPaise;

  return (
    <div className="space-y-4">
      <PageHeader title="Pay maintenance" back={{ href: "/home", label: "Home" }} />
      <div className="flex items-center gap-2 rounded-xl border border-warn/25 bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
        <FlaskConical size={16} aria-hidden />
        <span>
          <strong className="font-semibold">Test mode.</strong> No real money moves.
        </span>
      </div>
      <Card className="p-5">
        <div className="mb-5 flex items-center justify-between text-sm">
          <span className="text-ink-2">
            For <span className="num font-medium text-ink">{flat.code}</span>
          </span>
          {st.totalDuePaise > 0 ? <Pill>{formatINR(st.totalDuePaise)} due{interest > 0 ? ` incl. ${formatINR(interest)} interest` : ""}</Pill> : <Pill tone="ok">Nothing due</Pill>}
        </div>
        <PayForm defaultAmount={st.totalDuePaise > 0 ? st.totalDuePaise : 0} idempotencyKey={randomUUID()} />
      </Card>
    </div>
  );
}
