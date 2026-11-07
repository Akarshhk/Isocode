"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireResident } from "@/lib/auth/session";
import { flatStatement, receiptNo } from "@/lib/ledger";
import { todayIST } from "@/lib/dates";
import { formatINR, parseAmountToPaise } from "@/lib/money";
import { UNUSUAL_MONTHS } from "@/lib/matching/match";
import { monthlyBillPaise } from "@/lib/billing";

export type PayState = { error?: string; failed?: boolean };

const PaySchema = z.object({
  amount: z.string().min(1).max(15),
  method: z.enum(["UPI", "CARD", "NETBANKING"]),
  outcome: z.enum(["success", "failure"]),
  idempotencyKey: z.string().uuid(),
});

/** Test-mode checkout. No real gateway: success posts the payment at once, like a gateway webhook would. */
export async function payAction(_prev: PayState, formData: FormData): Promise<PayState> {
  const s = await requireResident();
  const parsed = PaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something was missing from the form. Reload and try again." };
  const { amount, method, outcome, idempotencyKey } = parsed.data;

  const amountPaise = parseAmountToPaise(amount);
  if (amountPaise == null || amountPaise < 100) return { error: "Enter an amount of at least ₹1." };

  const [st, flat, config] = await Promise.all([
    flatStatement(prisma, s.flatId),
    prisma.flat.findUniqueOrThrow({ where: { id: s.flatId } }),
    prisma.billingConfig.findFirst({ orderBy: { effectiveFrom: "desc" } }),
  ]);
  const monthly = monthlyBillPaise(flat.areaSqft, config?.ratePaisePerSqft ?? 650);
  const max = st.totalDuePaise + UNUSUAL_MONTHS * monthly;
  if (amountPaise > max) {
    return { error: `You can pay up to ${formatINR(max)} online (dues plus ${UNUSUAL_MONTHS} months in advance). For more, contact the help desk.` };
  }

  if (outcome === "failure") {
    return { failed: true, error: "The bank declined this test payment. Nothing was charged." };
  }

  let paymentId: number;
  try {
    const payment = await prisma.payment.create({
      data: {
        flatId: s.flatId,
        amountPaise,
        method: "GATEWAY",
        paidOn: todayIST(),
        gatewayRef: `pay_TEST_${randomBytes(7).toString("hex")}`,
        idempotencyKey,
        note: `Test mode · ${method === "UPI" ? "UPI" : method === "CARD" ? "Card" : "Net banking"}`,
      },
    });
    paymentId = payment.id;
    await prisma.notification.create({
      data: { userId: s.sub, channel: "SMS", body: `Received ${formatINR(amountPaise)} for ${flat.code}. Receipt ${receiptNo(payment.id)}.` },
    });
  } catch (e) {
    // Same form submitted twice (double tap, retry): show the receipt of the first one.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
      if (existing && existing.flatId === s.flatId) redirect(`/receipts/${existing.id}`);
    }
    throw e;
  }
  redirect(`/receipts/${paymentId}?new=1`);
}
