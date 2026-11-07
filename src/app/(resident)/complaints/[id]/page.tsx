import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireResident } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, Notice, PageHeader } from "@/components/ui";
import { StatusPill, Timeline, UrgencyPill } from "@/components/complaint-bits";
import { ResponseTimer } from "@/components/ResponseTimer";
import { CATEGORY_LABEL, REOPEN_WINDOW_DAYS, RESPONSE_MINUTES } from "@/lib/complaints/rules";
import { ResolveBox } from "./ResolveBox";
import { Star } from "lucide-react";

export const metadata: Metadata = { title: "Complaint" };

function minutesLabel(m: number) {
  return m < 60 ? `${m} minutes` : m < 1440 ? `${m / 60} hours` : `${m / 1440} day`;
}

export default async function ComplaintDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const s = await requireResident();
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const c = await prisma.complaint.findFirst({
    where: { id, flatId: s.flatId },
    include: {
      assignee: { select: { name: true, team: true } },
      photo: { select: { id: true } },
      events: { orderBy: { at: "asc" }, include: { actor: { select: { name: true, role: true } } } },
      duplicateOf: { select: { number: true, status: true, _count: { select: { duplicates: true } } } },
      _count: { select: { duplicates: true } },
    },
  });
  if (!c) notFound();

  const linkedCount = c.duplicateOf ? c.duplicateOf._count.duplicates : c._count.duplicates;
  const canReopen = c.status === "RESOLVED" && !!c.resolvedAt && Date.now() - c.resolvedAt.getTime() < REOPEN_WINDOW_DAYS * 86_400_000;
  // Residents see staff names on their own ticket, but not internal notes about AI confidence.
  const events = c.events.map((e) => ({
    id: e.id,
    type: e.type,
    message: e.type === "CLASSIFIED" ? `Sorted as ${CATEGORY_LABEL[c.category]}` : e.message,
    at: e.at,
    actorName: e.actor ? (e.actor.role === "RESIDENT" ? "You" : e.actor.name) : null,
  }));

  return (
    <div className="space-y-4">
      <PageHeader title={CATEGORY_LABEL[c.category]} sub={`#${c.number}`} back={{ href: "/complaints", label: "Complaints" }} />

      {isNew && (
        <Notice tone={c.safetyKeyword ? "danger" : "ok"} title={c.safetyKeyword ? "Marked Critical and sent to the duty manager" : "Complaint sent"}>
          {c.assignee ? `${c.assignee.name} has been assigned. ` : ""}
          We aim to respond within {minutesLabel(RESPONSE_MINUTES[c.urgency])}.
          {c.duplicateOf ? " Other flats in your tower reported this too, so it's being handled as one job." : ""}
        </Notice>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill status={c.status} />
          <UrgencyPill urgency={c.urgency} />
        </div>
        <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{c.description}</p>
        {c.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/photos/${c.photo.id}`} alt="Photo attached to the complaint" className="mt-3 max-h-64 rounded-xl border border-line object-cover" />
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
          <div>
            <dt className="text-xs text-ink-3">Assigned to</dt>
            <dd className="mt-0.5">{c.assignee?.name ?? "Help desk"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Response</dt>
            <dd className="mt-0.5">
              <ResponseTimer dueAt={c.responseDueAt.toISOString()} respondedAt={c.firstResponseAt?.toISOString() ?? null} createdAt={c.createdAt.toISOString()} />
            </dd>
          </div>
        </dl>
        {linkedCount > 0 && (
          <p className="mt-4 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">
            {linkedCount + 1} flats in your tower reported this. It&apos;s being handled as one job; each report stays open until its flat confirms the fix.
          </p>
        )}
      </Card>

      {c.status === "RESOLVED" && (
        <Card className="p-5">
          <p className="mb-4 text-sm text-ink-2">The team has marked this as resolved. Please confirm.</p>
          <ResolveBox id={c.id} canReopen={canReopen} />
        </Card>
      )}
      {c.status === "CLOSED" && c.rating && (
        <Card className="flex items-center gap-2 p-4 text-sm">
          <span className="text-ink-2">You rated this</span>
          <span className="flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={16} className={n <= c.rating! ? "fill-[#d79a12] text-[#d79a12]" : "text-line-strong"} aria-hidden />
            ))}
          </span>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-4 text-[15px] font-semibold">Updates</h2>
        <Timeline events={events} />
      </Card>
    </div>
  );
}
