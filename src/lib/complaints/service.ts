import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { classifyComplaint } from "./classify";
import { classifyWithClaude, describeAiError } from "./ai";
import { findDuplicateRoot, pickAssignee, DUPLICATE_WINDOW_HOURS } from "./linking";
import { CATEGORY_LABEL, RESPONSE_MINUTES, TEAM_FOR_CATEGORY, URGENCY_LABEL, type TeamT } from "./rules";

export type NewComplaintInput = {
  flatId: string;
  raisedById: string;
  description: string;
  photo: { mime: string; data: Buffer } | null;
};

/** Raises a complaint: classify, apply the safety rule, link duplicates, assign, notify. */
export async function raiseComplaint(input: NewComplaintInput) {
  const flat = await prisma.flat.findUniqueOrThrow({ where: { id: input.flatId }, include: { tower: true } });
  const cls = await classifyComplaint(input.description, classifyWithClaude, describeAiError);
  const now = new Date();

  const recent = await prisma.complaint.findMany({
    where: {
      towerId: flat.towerId,
      category: cls.category,
      status: { not: "CLOSED" },
      createdAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_HOURS * 3_600_000) },
    },
    select: { id: true, towerId: true, category: true, scope: true, createdAt: true, duplicateOfId: true, status: true, assigneeId: true, number: true },
  });
  const root = findDuplicateRoot({ towerId: flat.towerId, category: cls.category, scope: cls.scope, createdAt: now }, recent);

  const staff = await prisma.user.findMany({
    where: { role: "STAFF", active: true },
    select: { id: true, name: true, team: true, active: true, isDutyManager: true, _count: { select: { assigned: { where: { status: { in: ["ASSIGNED", "IN_PROGRESS"] } } } } } },
  });
  const rootAssignee = root ? recent.find((r) => r.id === root.id)?.assigneeId : null;
  const assigneeId =
    rootAssignee ??
    pickAssignee(
      TEAM_FOR_CATEGORY[cls.category],
      staff.filter((s) => s.team && !s.isDutyManager).map((s) => ({ id: s.id, team: s.team as TeamT, openCount: s._count.assigned, active: s.active })),
    );
  const assignee = staff.find((s) => s.id === assigneeId);
  const dutyManager = staff.find((s) => s.isDutyManager);

  const events: Omit<Prisma.ComplaintEventCreateManyInput, "complaintId">[] = [
    { type: "CREATED", message: "Complaint raised", actorId: input.raisedById, at: now },
    {
      type: "CLASSIFIED",
      message:
        cls.classifiedBy === "AI"
          ? `AI: ${CATEGORY_LABEL[cls.category]} · ${URGENCY_LABEL[cls.aiUrgency!]} · ${Math.round((cls.aiConfidence ?? 0) * 100)}% sure${cls.needsReview ? " (low confidence, help desk to check)" : ""}`
          : `Keyword fallback: ${CATEGORY_LABEL[cls.category]} (${cls.aiReason.split(".")[0]}). Help desk to check.`,
      at: now,
      data: { aiCategory: cls.aiCategory, aiUrgency: cls.aiUrgency, confidence: cls.aiConfidence, by: cls.classifiedBy },
    },
  ];
  if (cls.safetyKeyword) {
    events.push({
      type: "SAFETY_ESCALATED",
      message: `Safety word "${cls.safetyKeyword}": set to Critical and escalated to ${dutyManager?.name ?? "the duty manager"} (duty manager)`,
      at: now,
    });
  }
  if (root) events.push({ type: "LINKED", message: "Linked to an earlier report of the same issue in this tower", at: now, data: { rootId: root.id } });
  events.push({ type: "ASSIGNED", message: assignee ? `Auto-assigned to ${assignee.name} (${assignee.team?.toLowerCase()})` : "Waiting for the help desk to assign", at: now });

  const complaint = await prisma.$transaction(async (tx) => {
    const c = await tx.complaint.create({
      data: {
        flatId: flat.id,
        towerId: flat.towerId,
        raisedById: input.raisedById,
        description: input.description,
        category: cls.category,
        urgency: cls.urgency,
        scope: cls.scope,
        aiCategory: cls.aiCategory,
        aiUrgency: cls.aiUrgency,
        aiConfidence: cls.aiConfidence,
        aiReason: cls.aiReason.slice(0, 300),
        classifiedBy: cls.classifiedBy,
        needsReview: cls.needsReview,
        safetyKeyword: cls.safetyKeyword,
        assigneeId: assigneeId ?? null,
        duplicateOfId: root?.id ?? null,
        responseDueAt: new Date(now.getTime() + RESPONSE_MINUTES[cls.urgency] * 60_000),
        createdAt: now,
        photo: input.photo ? { create: { mime: input.photo.mime, data: new Uint8Array(input.photo.data) } } : undefined,
      },
    });
    await tx.complaintEvent.createMany({ data: events.map((e) => ({ ...e, complaintId: c.id })) });
    const notes: Prisma.NotificationCreateManyInput[] = [];
    if (assignee) notes.push({ userId: assignee.id, channel: "WHATSAPP", body: `New job #${c.number} (${CATEGORY_LABEL[c.category]}, ${URGENCY_LABEL[c.urgency]}) at ${flat.code}.` });
    if (cls.safetyKeyword && dutyManager) notes.push({ userId: dutyManager.id, channel: "SMS", body: `CRITICAL #${c.number} at ${flat.code}: "${cls.safetyKeyword}". Escalated by safety rule.` });
    if (notes.length) await tx.notification.createMany({ data: notes });
    return c;
  });
  return complaint;
}

/** Image signature check: we don't trust the browser's declared type. */
export function sniffImage(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}
