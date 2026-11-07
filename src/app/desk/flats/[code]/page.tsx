import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { flatStatement } from "@/lib/ledger";
import { Card, CardHeader, PageHeader, Pill, Stat } from "@/components/ui";
import { BillsList, LedgerTable } from "@/components/statement-views";
import { StatusPill } from "@/components/complaint-bits";
import { formatINR } from "@/lib/money";
import { formatPhone } from "@/lib/auth/phone";
import { CATEGORY_LABEL } from "@/lib/complaints/rules";

export const metadata: Metadata = { title: "Flat" };

export default async function FlatPage({ params }: { params: Promise<{ code: string }> }) {
  await requireRole("STAFF");
  const { code } = await params;
  const flat = await prisma.flat.findUnique({
    where: { code: decodeURIComponent(code).toUpperCase() },
    include: { members: { include: { user: true } }, upiHandles: true, complaints: { orderBy: { createdAt: "desc" }, take: 8 } },
  });
  if (!flat) notFound();
  const st = await flatStatement(prisma, flat.id);

  return (
    <div>
      <PageHeader back={{ href: "/desk/flats", label: "Flats" }} title={<span className="num">{flat.code}</span>} sub={`${flat.areaSqft.toLocaleString("en-IN")} sq ft`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            <Stat label="Total due" value={formatINR(st.totalDuePaise)} tone={st.oldestOverdueDays > 0 ? "danger" : undefined} />
            <Stat label="Overdue" value={st.oldestOverdueDays > 0 ? `${st.oldestOverdueDays} days` : "—"} />
            <Stat label="Interest" value={formatINR(st.accruedInterestPaise + st.interestChargedUnpaidPaise)} />
            <Stat label="Advance" value={formatINR(st.advanceCreditPaise)} />
          </Card>
          <Card>
            <CardHeader title="Bills" />
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
        </div>
        <div className="space-y-4">
          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">Residents</h2>
            <ul className="space-y-2">
              {flat.members.map((m) => (
                <li key={m.id}>
                  <p className="font-medium">
                    {m.user.name} <Pill className="ml-1">{m.relation === "TENANT" ? "Tenant" : "Owner"}</Pill>
                  </p>
                  <p className="num text-ink-3">{formatPhone(m.user.phone)}</p>
                </li>
              ))}
            </ul>
            <h2 className="mb-1 mt-4 font-semibold">Registered UPI IDs</h2>
            {flat.upiHandles.length === 0 ? (
              <p className="text-ink-3">None. Payments from this flat need a flat code in the reference to match automatically.</p>
            ) : (
              <ul className="font-mono text-xs text-ink-2">
                {flat.upiHandles.map((u) => (
                  <li key={u.id}>{u.vpa}</li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Complaints" />
            {flat.complaints.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-3">None.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {flat.complaints.map((c) => (
                  <li key={c.id}>
                    <Link href={`/desk/complaints/${c.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-sunken/60">
                      <span>
                        <span className="num text-ink-3">#{c.number}</span> {CATEGORY_LABEL[c.category]}
                      </span>
                      <StatusPill status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
