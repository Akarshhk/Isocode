import { addDays, daysBetween, periodStart, utcDate } from "./dates";
import { roundToRupee } from "./money";

/** Monthly maintenance = carpet area x rate, rounded to the rupee. 1150 sq ft x Rs 6.50 = Rs 7,475. */
export function monthlyBillPaise(areaSqft: number, ratePaisePerSqft: number): number {
  return roundToRupee(areaSqft * ratePaisePerSqft);
}

export function dueDateFor(period: string, dueDay: number): Date {
  const start = periodStart(period);
  return utcDate(start.getUTCFullYear(), start.getUTCMonth() + 1, dueDay);
}

/** Simple interest in (fractional) paise: principal x rate x days / 365. */
export function interestPaise(principalPaise: number, days: number, bpsPerYear: number): number {
  if (principalPaise <= 0 || days <= 0) return 0;
  return (principalPaise * bpsPerYear * days) / (10_000 * 365);
}

export type StatementBill = {
  id: string;
  period: string;
  amountPaise: number;
  issuedOn: Date;
  dueOn: Date;
  interestBpsPerYear: number;
};

export type StatementPayment = {
  id: number;
  amountPaise: number;
  paidOn: Date;
  method: "GATEWAY" | "BANK";
  reference?: string | null;
};

export type Allocation = { kind: "INTEREST" | "BILL" | "ADVANCE"; period?: string; paise: number };

export type LedgerLine = {
  date: Date;
  kind: "BILL" | "INTEREST" | "PAYMENT";
  label: string;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number; // positive = flat owes the society
  paymentId?: number;
};

export type BillStatus = "PAID" | "PART_PAID" | "UNPAID" | "NOT_DUE";

export type BillState = StatementBill & {
  paidPaise: number;
  remainingPaise: number;
  paidOffOn: Date | null;
  status: BillStatus;
  daysOverdue: number;
};

export type Statement = {
  asOf: Date;
  bills: BillState[];
  lines: LedgerLine[];
  allocations: Map<number, Allocation[]>;
  outstandingPrincipalPaise: number;
  interestChargedUnpaidPaise: number;
  accruedInterestPaise: number; // accrued since the last charge, rounded to the rupee
  totalDuePaise: number; // what "Pay now" asks for
  advanceCreditPaise: number;
  oldestOverdueDays: number; // 0 when nothing is overdue
  overduePrincipalPaise: number;
};

/**
 * Replays a flat's bills and payments in date order and returns its ledger.
 *
 * Rules (labelled assumptions in the TDD):
 * - Interest is simple interest at the bill's snapshotted rate, on unpaid principal, for each day
 *   after the due date.
 * - Accrued interest is charged to the ledger at the moment a payment arrives; the payment then
 *   clears interest first, then the oldest bill (FIFO). Anything left is advance credit, used
 *   automatically when the next bill is issued.
 * - Only bills issued and payments made on or before `asOf` count.
 */
export function buildStatement(
  billsIn: StatementBill[],
  paymentsIn: StatementPayment[],
  asOf: Date,
): Statement {
  type Ev = { date: Date; order: number; bill?: StatementBill; payment?: StatementPayment };
  const events: Ev[] = [
    ...billsIn.filter((b) => b.issuedOn <= asOf).map((b): Ev => ({ date: b.issuedOn, order: 0, bill: b })),
    ...paymentsIn.filter((p) => p.paidOn <= asOf).map((p): Ev => ({ date: p.paidOn, order: 1, payment: p })),
  ].sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      a.order - b.order ||
      (a.payment?.id ?? 0) - (b.payment?.id ?? 0) ||
      (a.bill && b.bill ? a.bill.period.localeCompare(b.bill.period) : 0),
  );

  const open: { bill: StatementBill; remaining: number; paid: number; paidOffOn: Date | null }[] = [];
  const allocations = new Map<number, Allocation[]>();
  const lines: LedgerLine[] = [];
  let interestUnpaid = 0;
  let accrued = 0; // fractional paise not yet charged
  let credit = 0;
  let balance = 0;
  let cursor: Date | null = null;

  const accrueTo = (to: Date) => {
    for (const o of open) {
      if (o.remaining <= 0) continue;
      const from = cursor && cursor > o.bill.dueOn ? cursor : o.bill.dueOn;
      const days = daysBetween(from, to);
      if (days > 0) accrued += interestPaise(o.remaining, days, o.bill.interestBpsPerYear);
    }
    cursor = to;
  };

  const payOpenBills = (amount: number, date: Date, into?: Allocation[]) => {
    let left = amount;
    for (const o of [...open].sort((a, b) => a.bill.dueOn.getTime() - b.bill.dueOn.getTime())) {
      if (left <= 0) break;
      if (o.remaining <= 0) continue;
      const take = Math.min(left, o.remaining);
      o.remaining -= take;
      o.paid += take;
      left -= take;
      if (o.remaining === 0) o.paidOffOn = date;
      into?.push({ kind: "BILL", period: o.bill.period, paise: take });
    }
    return left;
  };

  for (const ev of events) {
    accrueTo(ev.date);
    if (ev.bill) {
      const b = ev.bill;
      open.push({ bill: b, remaining: b.amountPaise, paid: 0, paidOffOn: null });
      balance += b.amountPaise;
      lines.push({
        date: b.issuedOn,
        kind: "BILL",
        label: `Maintenance bill, ${b.period}`,
        debitPaise: b.amountPaise,
        creditPaise: 0,
        balancePaise: balance,
      });
      if (credit > 0) credit = payOpenBills(credit, b.issuedOn);
    } else if (ev.payment) {
      const p = ev.payment;
      const charge = roundToRupee(accrued);
      accrued = 0;
      if (charge > 0) {
        interestUnpaid += charge;
        balance += charge;
        lines.push({
          date: p.paidOn,
          kind: "INTEREST",
          label: "Interest on overdue dues",
          debitPaise: charge,
          creditPaise: 0,
          balancePaise: balance,
        });
      }
      const alloc: Allocation[] = [];
      let left = p.amountPaise;
      const toInterest = Math.min(left, interestUnpaid);
      if (toInterest > 0) {
        interestUnpaid -= toInterest;
        left -= toInterest;
        alloc.push({ kind: "INTEREST", paise: toInterest });
      }
      left = payOpenBills(left, p.paidOn, alloc);
      if (left > 0) {
        credit += left;
        alloc.push({ kind: "ADVANCE", paise: left });
      }
      allocations.set(p.id, alloc);
      balance -= p.amountPaise;
      lines.push({
        date: p.paidOn,
        kind: "PAYMENT",
        label: p.method === "GATEWAY" ? "Online payment" : "Bank credit",
        debitPaise: 0,
        creditPaise: p.amountPaise,
        balancePaise: balance,
        paymentId: p.id,
      });
    }
  }
  accrueTo(asOf);

  const bills: BillState[] = open
    .map((o) => {
      const overdue = o.remaining > 0 && o.bill.dueOn < asOf;
      const status: BillStatus =
        o.remaining === 0
          ? "PAID"
          : o.bill.dueOn >= asOf && o.paid === 0
            ? "NOT_DUE"
            : o.paid > 0
              ? "PART_PAID"
              : "UNPAID";
      return {
        ...o.bill,
        paidPaise: o.paid,
        remainingPaise: o.remaining,
        paidOffOn: o.paidOffOn,
        status,
        daysOverdue: overdue ? daysBetween(o.bill.dueOn, asOf) : 0,
      };
    })
    .sort((a, b) => b.period.localeCompare(a.period));

  const outstanding = bills.reduce((s, b) => s + b.remainingPaise, 0);
  const accruedRounded = roundToRupee(accrued);
  return {
    asOf,
    bills,
    lines,
    allocations,
    outstandingPrincipalPaise: outstanding,
    interestChargedUnpaidPaise: interestUnpaid,
    accruedInterestPaise: accruedRounded,
    totalDuePaise: outstanding + interestUnpaid + accruedRounded,
    advanceCreditPaise: credit,
    oldestOverdueDays: Math.max(0, ...bills.map((b) => b.daysOverdue)),
    overduePrincipalPaise: bills.filter((b) => b.daysOverdue > 0).reduce((s, b) => s + b.remainingPaise, 0),
  };
}

/** Ageing bucket of an overdue amount, for the committee report. */
export function ageingBucket(daysOverdue: number): "0-30" | "31-60" | "61-90" | "90+" {
  if (daysOverdue <= 30) return "0-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

export { addDays };
