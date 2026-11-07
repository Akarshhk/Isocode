import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, MessageSquareWarning } from "lucide-react";
import { requireResident } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { StatusPill, UrgencyPill } from "@/components/complaint-bits";
import { CATEGORY_LABEL } from "@/lib/complaints/rules";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Complaints" };

export default async function ComplaintsPage() {
  const s = await requireResident();
  const all = await prisma.complaint.findMany({ where: { flatId: s.flatId }, orderBy: { createdAt: "desc" }, take: 50 });
  const open = all.filter((c) => c.status !== "CLOSED");
  const closed = all.filter((c) => c.status === "CLOSED");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Complaints"
        action={
          <LinkButton href="/complaints/new" size="sm">
            <Plus size={16} aria-hidden /> New
          </LinkButton>
        }
      />
      {all.length === 0 ? (
        <Card>
          <EmptyState icon={<MessageSquareWarning size={20} />} title="No complaints yet" action={<LinkButton href="/complaints/new">Raise a complaint</LinkButton>}>
            Report leaks, power, lift or anything else. You can follow every step here.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Section title="Open" items={open} empty="Nothing open right now." />
          {closed.length > 0 && <Section title="Closed" items={closed} />}
        </>
      )}
    </div>
  );
}

function Section({ title, items, empty }: { title: string; items: Awaited<ReturnType<typeof prisma.complaint.findMany>>; empty?: string }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-ink-3">{title}</h2>
      <Card>
        {items.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-3">{empty}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((c) => (
              <li key={c.id}>
                <Link href={`/complaints/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{CATEGORY_LABEL[c.category]}</span>
                      <StatusPill status={c.status} />
                      {c.urgency === "CRITICAL" && <UrgencyPill urgency="CRITICAL" />}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-3">{c.description}</p>
                    <p className="num mt-0.5 text-xs text-ink-3">
                      #{c.number} · {formatDateTime(c.createdAt)}
                      {c.rating ? ` · rated ${c.rating}/5` : ""}
                    </p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
