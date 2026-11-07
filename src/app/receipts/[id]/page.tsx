import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { canViewFlat } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { flatStatement, receiptNo } from "@/lib/ledger";
import { formatINR } from "@/lib/money";
import { formatDate, periodLabel } from "@/lib/dates";
import { Card, LinkButton, Divider } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { PrintButton } from "@/components/PrintButton";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const session = await requireRole("RESIDENT", "STAFF");
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const paymentId = Number(id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) notFound();

  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { flat: { include: { members: { include: { user: true } } } } } });
  // Same response for "doesn't exist" and "not yours": don't leak which receipt numbers exist.
  if (!payment || !canViewFlat(session, payment.flatId)) notFound();

  const st = await flatStatement(prisma, payment.flatId);
  const alloc = st.allocations.get(payment.id) ?? [];
  const resident = payment.flat.members[0]?.user.name;
  const back = session.role === "STAFF" ? `/desk/flats/${payment.flat.code}` : "/home";

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <div className="no-print mb-4 flex items-center justify-between">
        <LinkButton href={back} variant="ghost" size="sm">
          ← {session.role === "STAFF" ? "Flat ledger" : "Home"}
        </LinkButton>
        <PrintButton />
      </div>

      {isNew && (
        <div className="no-print mb-4 flex items-center gap-3 rounded-[var(--radius-card)] border border-ok/25 bg-ok-soft px-4 py-3">
          <CheckCircle2 className="text-ok" size={22} aria-hidden />
          <div>
            <p className="font-semibold text-ok">Payment received</p>
            <p className="text-sm text-ink-2">Posted to your ledger. An SMS confirmation is on its way.</p>
          </div>
        </div>
      )}

      <Card className="p-6">
        <div className="flex items-start justify-between">
          <Logo />
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-ink-3">Receipt</p>
            <p className="num font-semibold">{receiptNo(payment.id)}</p>
          </div>
        </div>
        <p className="mt-6 text-xs uppercase tracking-wide text-ink-3">Amount received</p>
        <p className="num text-4xl font-semibold tracking-tight">{formatINR(payment.amountPaise)}</p>

        <dl className="mt-6 space-y-2.5 text-sm">
          <Row label="Flat" value={payment.flat.code} />
          {resident && <Row label="Resident" value={resident} />}
          <Row label="Date" value={formatDate(payment.paidOn)} />
          <Row label="Method" value={payment.method === "GATEWAY" ? `Online${payment.note ? ` (${payment.note.replace("Test mode · ", "")}, test mode)` : ""}` : "Bank credit"} />
          {(payment.gatewayRef || payment.utr) && <Row label="Reference" value={payment.gatewayRef ?? payment.utr!} mono />}
        </dl>

        {alloc.length > 0 && (
          <>
            <div className="my-5">
              <Divider />
            </div>
            <p className="mb-2 text-xs uppercase tracking-wide text-ink-3">Applied to</p>
            <ul className="space-y-1.5 text-sm">
              {alloc.map((a, i) => (
                <li key={i} className="flex justify-between">
                  <span className="text-ink-2">
                    {a.kind === "INTEREST" ? "Interest on late dues" : a.kind === "ADVANCE" ? "Advance credit" : `Maintenance, ${periodLabel(a.period!)}`}
                  </span>
                  <span className="num">{formatINR(a.paise)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="my-5">
          <Divider />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ink-2">Balance due today</span>
          <span className="num font-medium">{formatINR(st.totalDuePaise)}</span>
        </div>
        <p className="mt-6 text-xs leading-relaxed text-ink-3">
          Maintenance contribution to the residents&apos; federation. Computer-generated receipt; no signature needed.
        </p>
      </Card>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-3">{label}</dt>
      <dd className={`text-right ${mono ? "num break-all font-mono text-xs leading-5" : ""}`}>{value}</dd>
    </div>
  );
}
