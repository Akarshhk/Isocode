import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CheckCircle2, Plus, Receipt } from "lucide-react";
import { requireResident } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { flatStatement, receiptNo } from "@/lib/ledger";
import { formatINR } from "@/lib/money";
import { formatDate, formatDayMonth } from "@/lib/dates";
import { Card, CardHeader, LinkButton, Pill } from "@/components/ui";
import { StatusPill, UrgencyPill, LinkedBadge } from "@/components/complaint-bits";
import { ResponseTimer } from "@/components/ResponseTimer";
import { CATEGORY_LABEL } from "@/lib/complaints/rules";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const s = await requireResident();
  const [st, member, open, lastPayment] = await Promise.all([
    flatStatement(prisma, s.flatId),
    prisma.flatMember.findUnique({ where: { userId: s.sub } }),
    prisma.complaint.findMany({
      where: { flatId: s.flatId, status: { not: "CLOSED" } },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { assignee: { select: { name: true } }, duplicateOf: { select: { _count: { select: { duplicates: true } } } } },
    }),
    prisma.payment.findFirst({ where: { flatId: s.flatId }, orderBy: [{ paidOn: "desc" }, { id: "desc" }] }),
  ]);
  const firstName = s.name.split(" ")[0];
  const nextDue = st.bills.filter((b) => b.remainingPaise > 0 && b.daysOverdue === 0).sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())[0];
  const interest = st.accruedInterestPaise + st.interestChargedUnpaidPaise;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Hi, {firstName}</h1>
        <p className="text-sm text-ink-3">{member?.relation === "TENANT" ? "Tenant" : "Owner"}</p>
      </div>

      <Card className="p-5">
        {st.totalDuePaise > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink-2">To pay</p>
              {st.oldestOverdueDays > 0 ? (
                <Pill tone="danger">Overdue {st.oldestOverdueDays} days</Pill>
              ) : nextDue ? (
                <Pill tone="neutral">Due {formatDayMonth(nextDue.dueOn)}</Pill>
              ) : null}
            </div>
            <p className="num mt-1 text-[40px] font-semibold leading-tight tracking-tight">{formatINR(st.totalDuePaise)}</p>
            <p className="mt-1 text-sm text-ink-3">
              {formatINR(st.outstandingPrincipalPaise)} maintenance
              {interest > 0 && <> + {formatINR(interest)} interest on late dues</>}
            </p>
            <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
              <LinkButton href="/pay" size="lg">
                Pay {formatINR(st.totalDuePaise)}
              </LinkButton>
              <LinkButton href="/dues" size="lg" variant="secondary">
                Details
              </LinkButton>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 shrink-0 text-ok" size={24} aria-hidden />
            <div className="flex-1">
              <p className="font-semibold">All dues paid</p>
              <p className="mt-0.5 text-sm text-ink-3">
                {st.advanceCreditPaise > 0 ? `${formatINR(st.advanceCreditPaise)} advance credit will go towards your next bill.` : "Thank you. Your next bill will appear here."}
              </p>
              <Link href="/dues" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand">
                Bills and receipts <ChevronRight size={16} aria-hidden />
              </Link>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Complaints"
          action={
            <Link href="/complaints" className="text-sm font-medium text-brand">
              All
            </Link>
          }
        />
        {open.length === 0 ? (
          <p className="px-4 pb-1 pt-2 text-sm text-ink-3 sm:px-5">Nothing open. Report a problem and track it here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {open.map((c) => (
              <li key={c.id}>
                <Link href={`/complaints/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken/60 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{CATEGORY_LABEL[c.category]}</span>
                      <StatusPill status={c.status} />
                      {c.urgency === "CRITICAL" && <UrgencyPill urgency="CRITICAL" />}
                      {c.duplicateOf && <LinkedBadge count={c.duplicateOf._count.duplicates} />}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-3">{c.description}</p>
                    <div className="mt-1">
                      {c.status === "RESOLVED" ? (
                        <span className="text-xs font-medium text-ok">Fixed? Confirm and rate</span>
                      ) : (
                        <ResponseTimer dueAt={c.responseDueAt.toISOString()} respondedAt={c.firstResponseAt?.toISOString() ?? null} createdAt={c.createdAt.toISOString()} />
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="p-4 sm:px-5">
          <LinkButton href="/complaints/new" variant="secondary" full>
            <Plus size={18} aria-hidden /> Raise a complaint
          </LinkButton>
        </div>
      </Card>

      {lastPayment && (
        <Link href={`/receipts/${lastPayment.id}`} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 hover:bg-sunken/60 sm:px-5">
          <Receipt size={18} className="text-ink-3" aria-hidden />
          <span className="flex-1 text-sm">
            Last payment <span className="num font-medium">{formatINR(lastPayment.amountPaise)}</span> on {formatDate(lastPayment.paidOn)}
          </span>
          <span className="num text-xs text-ink-3">{receiptNo(lastPayment.id)}</span>
        </Link>
      )}
    </div>
  );
}
