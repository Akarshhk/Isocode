import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Sparkles, Bot } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, PageHeader, Pill, cx, inputClass } from "@/components/ui";
import { LinkedBadge, ReviewBadge, SafetyBadge, StatusPill, Timeline, UrgencyPill } from "@/components/complaint-bits";
import { ResponseTimer } from "@/components/ResponseTimer";
import { SubmitButton } from "@/components/SubmitButton";
import { CATEGORIES, CATEGORY_LABEL, STAFF_TRANSITIONS, URGENCIES, URGENCY_LABEL } from "@/lib/complaints/rules";
import { formatDateTime } from "@/lib/dates";
import { commentAction, reassignAction, resolveLinkedAction, setCategoryAction, setStatusAction, setUrgencyAction, unlinkAction } from "../actions";

export const metadata: Metadata = { title: "Complaint" };

export default async function DeskComplaint({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("STAFF");
  const { id } = await params;
  const c = await prisma.complaint.findUnique({
    where: { id },
    include: {
      flat: { include: { members: { include: { user: { select: { name: true } } } } } },
      raisedBy: { select: { name: true } },
      assignee: { select: { id: true, name: true, team: true } },
      photo: { select: { id: true } },
      events: { orderBy: { at: "asc" }, include: { actor: { select: { name: true } } } },
      duplicateOf: { select: { id: true, number: true, status: true } },
      duplicates: { orderBy: { createdAt: "asc" }, include: { flat: { select: { code: true } } } },
    },
  });
  if (!c) notFound();
  const staff = await prisma.user.findMany({ where: { role: "STAFF", active: true }, orderBy: [{ team: "asc" }, { name: "asc" }] });
  const closed = c.status === "CLOSED";
  const transitions = STAFF_TRANSITIONS[c.status] ?? [];
  const openLinked = c.duplicates.filter((d) => d.status === "ASSIGNED" || d.status === "IN_PROGRESS").length;

  return (
    <div>
      <PageHeader
        back={{ href: "/desk", label: "Complaints" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {CATEGORY_LABEL[c.category]} <span className="num text-ink-3">#{c.number}</span>
          </span>
        }
        sub={`${c.flat.code} · raised by ${c.raisedBy.name} · ${formatDateTime(c.createdAt)}`}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill status={c.status} />
              <UrgencyPill urgency={c.urgency} />
              {c.safetyKeyword && <SafetyBadge keyword={c.safetyKeyword} />}
              {c.needsReview && <ReviewBadge />}
              {c.duplicates.length > 0 && <LinkedBadge count={c.duplicates.length} />}
              <span className="ml-auto">
                {!closed && <ResponseTimer dueAt={c.responseDueAt.toISOString()} respondedAt={c.firstResponseAt?.toISOString() ?? null} createdAt={c.createdAt.toISOString()} />}
              </span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{c.description}</p>
            {c.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/photos/${c.photo.id}`} alt="Photo from the resident" className="mt-3 max-h-72 rounded-xl border border-line object-cover" />
            )}
            {c.reopenCount > 0 && <p className="mt-3 text-sm text-warn">Reopened {c.reopenCount} time{c.reopenCount > 1 ? "s" : ""} by the resident.</p>}
            {c.rating && <p className="mt-3 text-sm text-ink-2">Resident rated the fix {c.rating}/5.</p>}
          </Card>

          {c.duplicateOf && (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm">
                Linked to{" "}
                <Link className="font-medium text-brand hover:underline" href={`/desk/complaints/${c.duplicateOf.id}`}>
                  #{c.duplicateOf.number}
                </Link>{" "}
                as the same incident. It stays open until this flat confirms the fix.
              </p>
              {!closed && (
                <form action={unlinkAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton variant="secondary" size="sm" pendingLabel="Unlinking…">
                    Not the same issue: unlink
                  </SubmitButton>
                </form>
              )}
            </Card>
          )}

          {c.duplicates.length > 0 && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
                <div>
                  <h2 className="text-[15px] font-semibold">Linked reports ({c.duplicates.length})</h2>
                  <p className="text-sm text-ink-3">Same issue in the same tower within 24 hours. Linked, never closed automatically.</p>
                </div>
                {openLinked > 0 && (
                  <form action={resolveLinkedAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton size="sm" pendingLabel="Resolving…">
                      Resolve all {openLinked + (transitions.includes("RESOLVED") ? 1 : 0)}
                    </SubmitButton>
                  </form>
                )}
              </div>
              <ul className="mt-3 divide-y divide-line">
                {c.duplicates.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <Link href={`/desk/complaints/${d.id}`} className="num text-sm font-medium text-brand hover:underline">
                      #{d.number}
                    </Link>
                    <span className="num text-sm text-ink-3">{d.flat.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{d.description}</span>
                    <StatusPill status={d.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-4 text-[15px] font-semibold">Timeline</h2>
            <Timeline events={c.events.map((e) => ({ id: e.id, type: e.type, message: e.message, at: e.at, actorName: e.actor?.name ?? null }))} />
            {!closed && (
              <form action={commentAction} className="mt-5 flex gap-2">
                <input type="hidden" name="id" value={c.id} />
                <label htmlFor="text" className="sr-only">
                  Add a note
                </label>
                <input id="text" name="text" required maxLength={500} placeholder="Add a note for the timeline" className={inputClass} />
                <SubmitButton variant="secondary" pendingLabel="…">
                  Add
                </SubmitButton>
              </form>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {transitions.length > 0 && (
            <Card className="space-y-2 p-4">
              {transitions.includes("IN_PROGRESS") && (
                <form action={setStatusAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="to" value="IN_PROGRESS" />
                  <SubmitButton full variant={c.status === "RESOLVED" ? "secondary" : "primary"} pendingLabel="Updating…">
                    {c.status === "RESOLVED" ? "Back to in progress" : "Start work"}
                  </SubmitButton>
                </form>
              )}
              {transitions.includes("RESOLVED") && (
                <form action={setStatusAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="to" value="RESOLVED" />
                  <SubmitButton full variant={c.status === "IN_PROGRESS" ? "primary" : "secondary"} pendingLabel="Updating…">
                    Mark resolved
                  </SubmitButton>
                </form>
              )}
              <p className="pt-1 text-xs text-ink-3">The resident closes the complaint and rates it, or reopens it within 7 days.</p>
            </Card>
          )}

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Category</h2>
              {c.needsReview && <span className="text-xs text-warn">Tap the right one to confirm</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <form key={cat} action={setCategoryAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="category" value={cat} />
                  <button
                    disabled={closed}
                    aria-pressed={c.category === cat}
                    className={cx(
                      "rounded-lg border px-2.5 py-1.5 text-sm disabled:opacity-60",
                      c.category === cat ? (c.needsReview ? "border-warn bg-warn-soft font-medium text-warn" : "border-brand bg-brand-soft font-medium text-brand") : "border-line bg-surface text-ink-2 hover:bg-sunken",
                    )}
                  >
                    {CATEGORY_LABEL[cat]}
                  </button>
                </form>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-sunken p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                {c.classifiedBy === "AI" ? <Sparkles size={14} /> : <Bot size={14} />}
                {c.classifiedBy === "AI" ? "AI suggestion" : "Keyword fallback (AI unavailable)"}
              </p>
              {c.aiCategory && (
                <p className="mt-1 text-ink-2">
                  {CATEGORY_LABEL[c.aiCategory]} · {c.aiUrgency ? URGENCY_LABEL[c.aiUrgency] : ""}{" "}
                  {c.aiConfidence != null && (
                    <Pill tone={c.aiConfidence < 0.6 ? "warn" : "neutral"} className="ml-1">
                      {Math.round(c.aiConfidence * 100)}% sure
                    </Pill>
                  )}
                </p>
              )}
              {c.aiReason && <p className="mt-1 text-xs text-ink-3">{c.aiReason}</p>}
              {c.aiCategory && c.aiCategory !== c.category && <p className="mt-1 text-xs font-medium text-ink-2">Changed by the help desk.</p>}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Urgency</h2>
            {c.safetyKeyword ? (
              <div className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger">
                <Lock size={16} className="mt-0.5 shrink-0" />
                <p>
                  Critical by safety rule (&ldquo;{c.safetyKeyword}&rdquo;). Escalated to the duty manager. It can&apos;t be lowered
                  {c.aiUrgency && c.aiUrgency !== "CRITICAL" ? `, even though the AI suggested ${URGENCY_LABEL[c.aiUrgency]}` : ""}.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1">
                {URGENCIES.map((u) => (
                  <form key={u} action={setUrgencyAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="urgency" value={u} />
                    <button
                      disabled={closed}
                      aria-pressed={c.urgency === u}
                      className={cx(
                        "w-full rounded-lg border px-1 py-1.5 text-xs font-medium disabled:opacity-60",
                        c.urgency === u ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:bg-sunken",
                      )}
                    >
                      {URGENCY_LABEL[u]}
                    </button>
                  </form>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Assigned to</h2>
            <form action={reassignAction} className="flex gap-2">
              <input type="hidden" name="id" value={c.id} />
              <label htmlFor="assigneeId" className="sr-only">
                Assignee
              </label>
              <select id="assigneeId" name="assigneeId" defaultValue={c.assignee?.id} disabled={closed} className={cx(inputClass, "py-2 text-sm")}>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.isDutyManager ? "duty manager" : u.team?.toLowerCase()}
                  </option>
                ))}
              </select>
              <SubmitButton variant="secondary" size="md" disabled={closed} pendingLabel="…">
                Save
              </SubmitButton>
            </form>
          </Card>

          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">Flat</h2>
            <p>
              <Link href={`/desk/flats/${c.flat.code}`} className="num font-medium text-brand hover:underline">
                {c.flat.code}
              </Link>{" "}
              · {c.scope === "COMMON" ? "common area" : "inside the flat"}
            </p>
            <p className="text-ink-3">{c.flat.members.map((m) => m.user.name).join(", ")}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
