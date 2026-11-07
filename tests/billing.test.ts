import { describe, expect, it } from "vitest";
import { ageingBucket, buildStatement, dueDateFor, interestPaise, monthlyBillPaise, type StatementBill } from "@/lib/billing";
import { addDays, utcDate } from "@/lib/dates";

const bill = (period: string, amountPaise: number, dueOn?: Date): StatementBill => {
  const [y, m] = period.split("-").map(Number);
  return { id: period, period, amountPaise, issuedOn: utcDate(y, m, 1), dueOn: dueOn ?? utcDate(y, m, 10), interestBpsPerYear: 2100 };
};

describe("monthly bill", () => {
  it("is area x Rs 6.50, matching the client's sample rows exactly", () => {
    expect(monthlyBillPaise(1150, 650)).toBe(747_500);
    expect(monthlyBillPaise(980, 650)).toBe(637_000);
    expect(monthlyBillPaise(1640, 650)).toBe(1_066_000);
  });
  it("rounds to the rupee", () => {
    expect(monthlyBillPaise(1001, 650)).toBe(650_700); // 6506.50 -> 6507
  });
  it("falls due on the configured day", () => {
    expect(dueDateFor("2026-10", 10)).toEqual(utcDate(2026, 10, 10));
  });
});

describe("interest on arrears (21% a year, simple)", () => {
  it("is zero on or before the due date", () => {
    expect(interestPaise(637_000, 0, 2100)).toBe(0);
  });
  it("matches the worked examples", () => {
    // Rs 6,370 for 47 days = Rs 172.25; Rs 5,660 for 18 days = Rs 58.62
    expect(Math.round(interestPaise(637_000, 47, 2100) / 100)).toBe(172);
    expect(Math.round(interestPaise(566_000, 18, 2100) / 100)).toBe(59);
  });
});

describe("buildStatement", () => {
  const asOf = utcDate(2026, 11, 7);

  it("shows nothing due when the bill was paid on time", () => {
    const st = buildStatement([bill("2026-10", 747_500)], [{ id: 1, amountPaise: 747_500, paidOn: utcDate(2026, 10, 4), method: "GATEWAY" }], asOf);
    expect(st.totalDuePaise).toBe(0);
    expect(st.bills[0].status).toBe("PAID");
    expect(st.bills[0].paidOffOn).toEqual(utcDate(2026, 10, 4));
  });

  it("reproduces Aamir: Rs 5,000 paid before the due date, 18 days overdue, Rs 59 interest", () => {
    const due = addDays(asOf, -18);
    const st = buildStatement([bill("2026-10", 1_066_000, due)], [{ id: 1, amountPaise: 500_000, paidOn: utcDate(2026, 10, 8), method: "BANK" }], asOf);
    expect(st.oldestOverdueDays).toBe(18);
    expect(st.outstandingPrincipalPaise).toBe(566_000);
    expect(st.accruedInterestPaise).toBe(5_900);
    expect(st.totalDuePaise).toBe(571_900);
    expect(st.bills[0].status).toBe("PART_PAID");
  });

  it("charges accrued interest when a late payment arrives, and the payment clears interest first", () => {
    const st = buildStatement([bill("2026-10", 637_000)], [{ id: 7, amountPaise: 637_000, paidOn: utcDate(2026, 11, 6), method: "GATEWAY" }], asOf);
    // 27 days late: 6370 x 21% x 27/365 = Rs 98.95 -> Rs 99 charged; Rs 6,370 paid covers Rs 99 interest first.
    const interestLine = st.lines.find((l) => l.kind === "INTEREST");
    expect(interestLine?.debitPaise).toBe(9_900);
    expect(st.allocations.get(7)).toEqual([
      { kind: "INTEREST", paise: 9_900 },
      { kind: "BILL", period: "2026-10", paise: 627_100 },
    ]);
    expect(st.outstandingPrincipalPaise).toBe(9_900);
  });

  it("applies payments to the oldest bill first", () => {
    const st = buildStatement(
      [bill("2026-09", 637_000), bill("2026-10", 637_000)],
      [{ id: 1, amountPaise: 637_000, paidOn: utcDate(2026, 10, 9), method: "BANK" }],
      asOf,
    );
    // The Sep bill was 29 days late, so the payment pays interest, then most of September.
    const sep = st.bills.find((b) => b.period === "2026-09")!;
    const oct = st.bills.find((b) => b.period === "2026-10")!;
    expect(oct.paidPaise).toBe(0);
    expect(sep.paidPaise).toBeGreaterThan(600_000);
  });

  it("keeps overpayment as advance credit and uses it on the next bill", () => {
    const st = buildStatement(
      [bill("2026-10", 500_000), bill("2026-11", 500_000)],
      [{ id: 1, amountPaise: 1_000_000, paidOn: utcDate(2026, 10, 5), method: "BANK" }],
      utcDate(2026, 11, 20),
    );
    expect(st.allocations.get(1)).toContainEqual({ kind: "ADVANCE", paise: 500_000 });
    expect(st.totalDuePaise).toBe(0);
    expect(st.advanceCreditPaise).toBe(0);
    expect(st.bills.every((b) => b.status === "PAID")).toBe(true);
  });

  it("ignores bills and payments after the as-of date", () => {
    const st = buildStatement([bill("2026-12", 500_000)], [], asOf);
    expect(st.bills).toHaveLength(0);
    expect(st.totalDuePaise).toBe(0);
  });

  it("marks a bill that isn't due yet as NOT_DUE with no interest", () => {
    const st = buildStatement([bill("2026-11", 500_000)], [], utcDate(2026, 11, 7));
    expect(st.bills[0].status).toBe("NOT_DUE");
    expect(st.accruedInterestPaise).toBe(0);
    expect(st.totalDuePaise).toBe(500_000);
  });

  it("keeps a running balance that ends at the amount owed", () => {
    const st = buildStatement([bill("2026-09", 637_000), bill("2026-10", 637_000)], [], asOf);
    expect(st.lines.at(-1)?.balancePaise).toBe(1_274_000);
  });
});

describe("ageing buckets", () => {
  it.each([
    [1, "0-30"],
    [30, "0-30"],
    [31, "31-60"],
    [61, "61-90"],
    [91, "90+"],
  ])("%i days -> %s", (d, b) => expect(ageingBucket(d)).toBe(b));
});
