import type { Prisma, PrismaClient } from "@prisma/client";
import { buildStatement, type Statement, type StatementBill, type StatementPayment } from "./billing";
import { todayIST } from "./dates";

type Db = PrismaClient | Prisma.TransactionClient;

export function receiptNo(paymentId: number): string {
  return `RCT-${String(paymentId).padStart(6, "0")}`;
}

function toBills(rows: { id: string; period: string; amountPaise: number; issuedOn: Date; dueOn: Date; interestBpsPerYear: number }[]): StatementBill[] {
  return rows.map((b) => ({ id: b.id, period: b.period, amountPaise: b.amountPaise, issuedOn: b.issuedOn, dueOn: b.dueOn, interestBpsPerYear: b.interestBpsPerYear }));
}

function toPayments(rows: { id: number; amountPaise: number; paidOn: Date; method: "GATEWAY" | "BANK"; utr: string | null; gatewayRef: string | null }[]): StatementPayment[] {
  return rows.map((p) => ({ id: p.id, amountPaise: p.amountPaise, paidOn: p.paidOn, method: p.method, reference: p.gatewayRef ?? p.utr }));
}

export async function flatStatement(db: Db, flatId: string, asOf: Date = todayIST()): Promise<Statement> {
  const [bills, payments] = await Promise.all([
    db.bill.findMany({ where: { flatId } }),
    db.payment.findMany({ where: { flatId } }),
  ]);
  return buildStatement(toBills(bills), toPayments(payments), asOf);
}

/** Statements for every flat, in two queries. Used by matching and the committee report. */
export async function allStatements(db: Db, asOf: Date = todayIST()): Promise<Map<string, Statement>> {
  const [bills, payments] = await Promise.all([db.bill.findMany(), db.payment.findMany()]);
  const billsBy = new Map<string, typeof bills>();
  for (const b of bills) billsBy.set(b.flatId, [...(billsBy.get(b.flatId) ?? []), b]);
  const paysBy = new Map<string, typeof payments>();
  for (const p of payments) paysBy.set(p.flatId, [...(paysBy.get(p.flatId) ?? []), p]);
  const out = new Map<string, Statement>();
  const flatIds = new Set([...billsBy.keys(), ...paysBy.keys()]);
  for (const id of flatIds) out.set(id, buildStatement(toBills(billsBy.get(id) ?? []), toPayments(paysBy.get(id) ?? []), asOf));
  return out;
}
