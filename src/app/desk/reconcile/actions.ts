"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { parseStatementCsv } from "@/lib/matching/parse";
import { importStatement, isUniqueViolation } from "@/lib/matching/importer";

export type UploadState = { error?: string; details?: string[] };

const MAX_BYTES = 2_000_000;

export async function uploadStatementAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const s = await requireRole("STAFF");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file exported from the bank." };
  if (file.size > MAX_BYTES) return { error: "The file is larger than 2 MB. Split the statement by date range." };
  if (!/\.csv$/i.test(file.name)) return { error: "Upload the statement as a .csv file." };

  const text = await file.text();
  const { rows, errors } = parseStatementCsv(text);
  if (rows.length === 0) return { error: "No transactions could be read from this file.", details: errors.slice(0, 5) };
  if (errors.length > 0) {
    return { error: `${errors.length} row${errors.length > 1 ? "s" : ""} couldn't be read, so nothing was imported. Fix the file and upload again.`, details: errors.slice(0, 5) };
  }

  let importId: string;
  try {
    ({ importId } = await importStatement(file.name, s.sub, rows));
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "Some of these rows were imported at the same moment by someone else. Reload and upload again." };
    throw e;
  }
  revalidatePath("/desk/reconcile");
  redirect(`/desk/reconcile/${importId}`);
}

const ResolveSchema = z.object({ lineId: z.string().min(1).max(40), flatCode: z.string().trim().toUpperCase().regex(/^T\d{2}-\d{4}$/) });

export type ResolveState = { error?: string; ok?: string };

/** Accounts staff post a queued credit to a flat. The only way an unclear payment reaches a ledger. */
export async function postToFlatAction(_prev: ResolveState, formData: FormData): Promise<ResolveState> {
  const s = await requireRole("STAFF");
  const p = ResolveSchema.safeParse({ lineId: formData.get("lineId"), flatCode: formData.get("flatCode") });
  if (!p.success) return { error: "Enter a flat code like T07-1203." };
  const flat = await prisma.flat.findUnique({ where: { code: p.data.flatCode } });
  if (!flat) return { error: `There's no flat ${p.data.flatCode}.` };

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.bankLine.updateMany({
      where: { id: p.data.lineId, status: "QUEUED" },
      data: { status: "RESOLVED", flatId: flat.id, resolvedById: s.sub, resolvedAt: new Date() },
    });
    if (claimed.count !== 1) return "taken" as const;
    const line = await tx.bankLine.findUniqueOrThrow({ where: { id: p.data.lineId } });
    if (line.amountPaise <= 0) throw new Error("Queued line is not a credit");
    const utrTaken = line.reference ? await tx.payment.findUnique({ where: { utr: line.reference } }) : null;
    await tx.payment.create({
      data: {
        flatId: flat.id,
        amountPaise: line.amountPaise,
        method: "BANK",
        paidOn: line.txnDate,
        utr: utrTaken ? null : line.reference,
        bankLineId: line.id,
        postedById: s.sub,
        note: "Posted from the accounts queue",
      },
    });
    return "ok" as const;
  });
  if (result === "taken") return { error: "Someone else has already dealt with this row." };
  revalidatePath("/desk/reconcile");
  return { ok: `Posted to ${flat.code}.` };
}

export async function ignoreLineAction(formData: FormData) {
  const s = await requireRole("STAFF");
  const id = z.string().min(1).max(40).safeParse(formData.get("lineId"));
  if (!id.success) return;
  await prisma.bankLine.updateMany({ where: { id: id.data, status: "QUEUED" }, data: { status: "IGNORED", resolvedById: s.sub, resolvedAt: new Date() } });
  revalidatePath("/desk/reconcile");
}
