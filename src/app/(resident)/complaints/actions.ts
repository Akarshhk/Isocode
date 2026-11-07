"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireResident } from "@/lib/auth/session";
import { raiseComplaint, sniffImage } from "@/lib/complaints/service";
import { REOPEN_WINDOW_DAYS } from "@/lib/complaints/rules";

export type NewComplaintState = { error?: string; description?: string };

const MAX_PHOTO_BYTES = 1_500_000;

export async function createComplaintAction(_prev: NewComplaintState, formData: FormData): Promise<NewComplaintState> {
  const s = await requireResident();
  const description = String(formData.get("description") ?? "").trim();
  if (description.length < 10) return { error: "Describe the problem in a few words (at least 10 characters).", description };
  if (description.length > 1000) return { error: "Keep it under 1,000 characters.", description };

  let photo: { mime: string; data: Buffer } | null = null;
  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PHOTO_BYTES) return { error: "That photo is too large. Try another one.", description };
    const data = Buffer.from(await file.arrayBuffer());
    const mime = sniffImage(data);
    if (!mime) return { error: "Only JPEG, PNG or WebP photos can be attached.", description };
    photo = { mime, data };
  }

  // Basic flood control: at most 5 complaints per flat per hour.
  const lastHour = await prisma.complaint.count({ where: { flatId: s.flatId, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (lastHour >= 5) return { error: "You've raised several complaints in the last hour. Please call the help desk if this is urgent.", description };

  const c = await raiseComplaint({ flatId: s.flatId, raisedById: s.sub, description, photo });
  revalidatePath("/home");
  redirect(`/complaints/${c.id}?new=1`);
}

const CloseSchema = z.object({ id: z.string().min(1).max(40), rating: z.coerce.number().int().min(1).max(5) });

/** The resident confirms the fix and rates it. Only the resident can close. */
export async function closeComplaintAction(formData: FormData) {
  const s = await requireResident();
  const parsed = CloseSchema.safeParse({ id: formData.get("id"), rating: formData.get("rating") });
  if (!parsed.success) return;
  const { id, rating } = parsed.data;
  const done = await prisma.complaint.updateMany({
    where: { id, flatId: s.flatId, status: "RESOLVED" },
    data: { status: "CLOSED", closedAt: new Date(), rating },
  });
  if (done.count === 1) {
    await prisma.complaintEvent.create({ data: { complaintId: id, actorId: s.sub, type: "RATED", message: `Closed by resident, rated ${rating}/5` } });
  }
  revalidatePath(`/complaints/${id}`);
}

const ReopenSchema = z.object({ id: z.string().min(1).max(40), reason: z.string().trim().max(300).optional() });

/** "Not fixed": back to the same person, counted as a reopen. */
export async function reopenComplaintAction(formData: FormData) {
  const s = await requireResident();
  const parsed = ReopenSchema.safeParse({ id: formData.get("id"), reason: formData.get("reason") || undefined });
  if (!parsed.success) return;
  const c = await prisma.complaint.findFirst({ where: { id: parsed.data.id, flatId: s.flatId, status: "RESOLVED" } });
  if (!c || !c.resolvedAt) return;
  if (Date.now() - c.resolvedAt.getTime() > REOPEN_WINDOW_DAYS * 86_400_000) return;
  await prisma.$transaction([
    prisma.complaint.update({
      where: { id: c.id },
      // First-response time is kept as it was: it feeds the committee's response-time metric.
      data: { status: "ASSIGNED", resolvedAt: null, reopenCount: { increment: 1 } },
    }),
    prisma.complaintEvent.create({
      data: { complaintId: c.id, actorId: s.sub, type: "REOPENED", message: `Reopened by resident: ${parsed.data.reason || "still not fixed"}` },
    }),
  ]);
  revalidatePath(`/complaints/${c.id}`);
}
