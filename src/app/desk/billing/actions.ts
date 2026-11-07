"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { dueDateFor, monthlyBillPaise } from "@/lib/billing";
import { periodStart } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export type BillingState = { error?: string; ok?: string };

/** Issues one month's bills for every flat. Safe to run twice: a flat can't get two bills for a month. */
export async function generateBillsAction(_prev: BillingState, formData: FormData): Promise<BillingState> {
  await requireRole("STAFF");
  const p = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).safeParse(formData.get("period"));
  if (!p.success) return { error: "Pick a valid month." };
  const period = p.data;
  const issuedOn = periodStart(period);
  const config = await prisma.billingConfig.findFirst({ where: { effectiveFrom: { lte: issuedOn } }, orderBy: { effectiveFrom: "desc" } });
  if (!config) return { error: "No billing rate is in effect for that month." };

  const flats = await prisma.flat.findMany({ select: { id: true, areaSqft: true } });
  const res = await prisma.bill.createMany({
    data: flats.map((f) => ({
      flatId: f.id,
      period,
      amountPaise: monthlyBillPaise(f.areaSqft, config.ratePaisePerSqft),
      areaSqft: f.areaSqft,
      ratePaisePerSqft: config.ratePaisePerSqft,
      interestBpsPerYear: config.interestBpsPerYear,
      issuedOn,
      dueOn: dueDateFor(period, config.dueDay),
    })),
    skipDuplicates: true,
  });
  revalidatePath("/desk/billing");
  if (res.count === 0) return { ok: "Every flat already has a bill for that month. Nothing was added." };
  const total = flats.reduce((s, f) => s + monthlyBillPaise(f.areaSqft, config.ratePaisePerSqft), 0);
  return { ok: `Issued ${res.count} bills${res.count === flats.length ? `, ${formatINR(total)} in total` : ""}.` };
}
