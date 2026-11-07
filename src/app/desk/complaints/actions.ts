"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { CATEGORIES, CATEGORY_LABEL, RESPONSE_MINUTES, STAFF_TRANSITIONS, TEAM_FOR_CATEGORY, URGENCIES, URGENCY_LABEL, type TeamT } from "@/lib/complaints/rules";
import { pickAssignee } from "@/lib/complaints/linking";

const Id = z.string().min(1).max(40);

function done(id: string) {
  revalidatePath(`/desk/complaints/${id}`);
  revalidatePath("/desk");
}

async function event(data: Prisma.ComplaintEventUncheckedCreateInput) {
  await prisma.complaintEvent.create({ data });
}

export async function setStatusAction(formData: FormData) {
  const s = await requireRole("STAFF");
  const p = z.object({ id: Id, to: z.enum(["IN_PROGRESS", "RESOLVED"]) }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const c = await prisma.complaint.findUnique({ where: { id: p.data.id }, include: { flat: { include: { members: true } } } });
  if (!c || !STAFF_TRANSITIONS[c.status]?.includes(p.data.to)) return;
  const now = new Date();
  // Status change is guarded on the old status so two people clicking at once can't double-apply it.
  const res = await prisma.complaint.updateMany({
    where: { id: c.id, status: c.status },
    data: { status: p.data.to, firstResponseAt: c.firstResponseAt ?? now, resolvedAt: p.data.to === "RESOLVED" ? now : null },
  });
  if (res.count !== 1) return;
  await event({ complaintId: c.id, actorId: s.sub, type: "STATUS_CHANGED", message: p.data.to === "RESOLVED" ? "Marked resolved" : "Work started", data: { to: p.data.to } });
  if (p.data.to === "RESOLVED") {
    await prisma.notification.createMany({
      data: c.flat.members.map((m) => ({ userId: m.userId, channel: "SMS" as const, body: `Complaint #${c.number} is marked resolved. Please confirm in the app.` })),
    });
  }
  done(c.id);
}

/** One tap: set (or confirm) the category. Clears the "check category" flag; logged as an AI override if it differs. */
export async function setCategoryAction(formData: FormData) {
  const s = await requireRole("STAFF");
  const p = z.object({ id: Id, category: z.enum(CATEGORIES) }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const c = await prisma.complaint.findUnique({ where: { id: p.data.id }, include: { assignee: true } });
  if (!c || c.status === "CLOSED") return;
  const changed = c.category !== p.data.category;
  let assigneeId = c.assigneeId;
  if (changed && TEAM_FOR_CATEGORY[p.data.category] !== c.assignee?.team) {
    const staff = await prisma.user.findMany({
      where: { role: "STAFF", active: true, isDutyManager: false },
      select: { id: true, team: true, active: true, _count: { select: { assigned: { where: { status: { in: ["ASSIGNED", "IN_PROGRESS"] } } } } } },
    });
    assigneeId = pickAssignee(
      TEAM_FOR_CATEGORY[p.data.category],
      staff.filter((x) => x.team).map((x) => ({ id: x.id, team: x.team as TeamT, openCount: x._count.assigned, active: x.active })),
    );
  }
  await prisma.complaint.update({ where: { id: c.id }, data: { category: p.data.category, needsReview: false, assigneeId } });
  await event({
    complaintId: c.id,
    actorId: s.sub,
    type: "RECATEGORISED",
    message: changed ? `Category changed from ${CATEGORY_LABEL[c.category]} to ${CATEGORY_LABEL[p.data.category]}` : `Category confirmed: ${CATEGORY_LABEL[c.category]}`,
    data: { from: c.category, to: p.data.category },
  });
  if (assigneeId && assigneeId !== c.assigneeId) {
    const a = await prisma.user.findUnique({ where: { id: assigneeId } });
    await event({ complaintId: c.id, actorId: s.sub, type: "ASSIGNED", message: `Reassigned to ${a?.name} (${a?.team?.toLowerCase()})` });
  }
  done(c.id);
}

export async function setUrgencyAction(formData: FormData) {
  const s = await requireRole("STAFF");
  const p = z.object({ id: Id, urgency: z.enum(URGENCIES) }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const c = await prisma.complaint.findUnique({ where: { id: p.data.id } });
  if (!c || c.status === "CLOSED" || c.urgency === p.data.urgency) return;
  // The safety rule can't be overridden from the UI either.
  if (c.safetyKeyword && p.data.urgency !== "CRITICAL") return;
  await prisma.complaint.update({
    where: { id: c.id },
    data: { urgency: p.data.urgency, responseDueAt: new Date(c.createdAt.getTime() + RESPONSE_MINUTES[p.data.urgency] * 60_000) },
  });
  await event({ complaintId: c.id, actorId: s.sub, type: "URGENCY_CHANGED", message: `Urgency changed from ${URGENCY_LABEL[c.urgency]} to ${URGENCY_LABEL[p.data.urgency]}` });
  done(c.id);
}

export async function reassignAction(formData: FormData) {
  const s = await requireRole("STAFF");
  const p = z.object({ id: Id, assigneeId: Id }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const [c, a] = await Promise.all([prisma.complaint.findUnique({ where: { id: p.data.id } }), prisma.user.findFirst({ where: { id: p.data.assigneeId, role: "STAFF", active: true } })]);
  if (!c || !a || c.status === "CLOSED" || c.assigneeId === a.id) return;
  await prisma.complaint.update({ where: { id: c.id }, data: { assigneeId: a.id } });
  await event({ complaintId: c.id, actorId: s.sub, type: "ASSIGNED", message: `Reassigned to ${a.name} (${a.team?.toLowerCase()})` });
  await prisma.notification.create({ data: { userId: a.id, channel: "WHATSAPP", body: `Job #${c.number} assigned to you.` } });
  done(c.id);
}

export async function commentAction(formData: FormData) {
  const s = await requireRole("STAFF");
  const p = z.object({ id: Id, text: z.string().trim().min(1).max(500) }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const c = await prisma.complaint.findUnique({ where: { id: p.data.id } });
  if (!c) return;
  await event({ complaintId: c.id, actorId: s.sub, type: "COMMENT", message: p.data.text });
  if (!c.firstResponseAt) await prisma.complaint.update({ where: { id: c.id }, data: { firstResponseAt: new Date() } });
  done(c.id);
}

/** Separate a wrongly linked report. Duplicates are only ever linked or unlinked, never closed. */
export async function unlinkAction(formData: FormData) {
  const s = await requireRole("STAFF");
  const p = z.object({ id: Id }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const c = await prisma.complaint.findUnique({ where: { id: p.data.id }, include: { duplicateOf: true } });
  if (!c?.duplicateOf) return;
  await prisma.complaint.update({ where: { id: c.id }, data: { duplicateOfId: null } });
  await event({ complaintId: c.id, actorId: s.sub, type: "UNLINKED", message: `Unlinked from #${c.duplicateOf.number}: treated as a separate issue` });
  await event({ complaintId: c.duplicateOf.id, actorId: s.sub, type: "UNLINKED", message: `#${c.number} unlinked: separate issue` });
  done(c.id);
  done(c.duplicateOf.id);
}

/** Deliberate human action: mark the main report and every linked report resolved. Residents still confirm each. */
export async function resolveLinkedAction(formData: FormData) {
  const s = await requireRole("STAFF");
  const p = z.object({ id: Id }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const root = await prisma.complaint.findUnique({ where: { id: p.data.id }, include: { duplicates: { include: { flat: { include: { members: true } } } }, flat: { include: { members: true } } } });
  if (!root) return;
  const now = new Date();
  const targets = [root, ...root.duplicates].filter((c) => c.status === "ASSIGNED" || c.status === "IN_PROGRESS");
  for (const c of targets) {
    const r = await prisma.complaint.updateMany({ where: { id: c.id, status: c.status }, data: { status: "RESOLVED", resolvedAt: now, firstResponseAt: c.firstResponseAt ?? now } });
    if (r.count !== 1) continue;
    await event({ complaintId: c.id, actorId: s.sub, type: "STATUS_CHANGED", message: c.id === root.id ? "Marked resolved" : `Marked resolved with #${root.number}`, data: { to: "RESOLVED" } });
    await prisma.notification.createMany({
      data: c.flat.members.map((m) => ({ userId: m.userId, channel: "SMS" as const, body: `Complaint #${c.number} is marked resolved. Please confirm in the app.` })),
    });
  }
  done(root.id);
}
