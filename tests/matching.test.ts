import { describe, expect, it } from "vitest";
import { decide, type MatchContext, type MatchFlat } from "@/lib/matching/match";
import { fingerprintOf, parseStatementCsv, type StatementRow } from "@/lib/matching/parse";
import { extractFlatCodes, extractVpas, nameAppears } from "@/lib/matching/refs";
import { utcDate } from "@/lib/dates";

const flats: MatchFlat[] = [
  { id: "f1", code: "T07-1203", residentNames: ["Neeraj Kulkarni"], monthlyBillPaise: 747_500, duePaise: 747_500 },
  { id: "f2", code: "T12-0408", residentNames: ["Swati Joshi"], monthlyBillPaise: 637_000, duePaise: 1_301_500 },
  { id: "f3", code: "T21-1601", residentNames: ["Aamir Shaikh"], monthlyBillPaise: 1_066_000, duePaise: 571_900 },
  { id: "f4", code: "T05-0302", residentNames: ["Meera Iyer"], monthlyBillPaise: 637_000, duePaise: 637_000 },
  { id: "f5", code: "T16-0306", residentNames: ["Leena Kapoor"], monthlyBillPaise: 637_000, duePaise: 637_000 },
];

function ctx(overrides: Partial<MatchContext> = {}): MatchContext {
  return {
    flatsByCode: new Map(flats.map((f) => [f.code, f])),
    flatsById: new Map(flats.map((f) => [f.id, f])),
    vpaToFlatId: new Map([["neeraj.kulkarni@okhdfcbank", "f1"], ["aamir.shaikh@okicici", "f3"]]),
    postedReferences: new Map(),
    gatewaySettlements: new Map(),
    seenFingerprints: new Set(),
    seenReferences: new Set(),
    ...overrides,
  };
}

function row(narration: string, amountPaise: number, reference: string | null = null): StatementRow {
  const txnDate = utcDate(2026, 11, 3);
  return { rowNumber: 1, txnDate, narration, reference, amountPaise, fingerprint: fingerprintOf(txnDate, amountPaise, reference, narration) };
}

describe("reference parsing", () => {
  it.each([
    ["NEFT CR-HDFC0001234-NEERAJ-T07-1203 MAINT", "T07-1203"],
    ["IMPS/P2A/KUNAL/T7 1203 maintenance", "T07-1203"],
    ["T071203 OCT", "T07-1203"],
    ["TWR 7 FLAT 1203", "T07-1203"],
    ["TOWER 07 - 1203", "T07-1203"],
    ["FLAT 1203 T7", "T07-1203"],
    ["T-12/408", "T12-0408"],
  ])("%s -> %s", (narration, code) => expect(extractFlatCodes(narration)).toContain(code));

  it("doesn't read flat codes out of words or plain numbers", () => {
    expect(extractFlatCodes("MAINTENANCE OCT 2026 UPI/430612345678")).toEqual([]);
  });

  it("extracts UPI IDs in lower case", () => {
    expect(extractVpas("UPI/CR/123/NEERAJ/Neeraj.Kulkarni@okhdfcbank/x")).toEqual(["neeraj.kulkarni@okhdfcbank"]);
  });

  it("matches payer names written without spaces", () => {
    expect(nameAppears("IMPS/P2A/SWATIJOSHI/rent", "Swati Joshi")).toBe(true);
    expect(nameAppears("IMPS/P2A/SWATI/rent", "Swati Joshi")).toBe(false);
  });
});

describe("decide: the matching decision table", () => {
  it("auto-posts when a registered UPI ID identifies the flat", () => {
    const d = decide(row("UPI/CR/430611000101/NEERAJ KULKARNI/neeraj.kulkarni@okhdfcbank/MAINT", 747_500, "430611000101"), ctx());
    expect(d.status).toBe("AUTO_POSTED");
    expect(d.flatId).toBe("f1");
    expect(d.reasons.join(" ")).toContain("Pays the full");
  });

  it("auto-posts from a flat code in the reference, and records a part payment", () => {
    const d = decide(row("NEFT CR-ICIC000123-AAMIR SHAIKH-T21-1601 MAINT OCT", 300_000, "N1"), ctx());
    expect(d.status).toBe("AUTO_POSTED");
    expect(d.flatId).toBe("f3");
    expect(d.reasons.join(" ")).toContain("Part payment");
  });

  it("never posts on amount alone, even when the amount is an exact bill", () => {
    const d = decide(row("NEFT CR-SBIN0004321-MRS D MENON-MAINTENANCE", 637_000, "N2"), ctx());
    expect(d.status).toBe("QUEUED");
    expect(d.flatId).toBeUndefined();
    expect(d.candidates.map((c) => c.flatCode).sort()).toEqual(["T05-0302", "T12-0408", "T16-0306"]);
    expect(d.reasons.join(" ")).toContain("amount alone can't identify");
  });

  it("queues conflicting identifiers instead of guessing", () => {
    const d = decide(row("UPI/CR/1/NEERAJ/neeraj.kulkarni@okhdfcbank/T16-0306", 637_000, "N3"), ctx());
    expect(d.status).toBe("QUEUED");
    expect(d.candidates.map((c) => c.flatCode).sort()).toEqual(["T07-1203", "T16-0306"]);
  });

  it("queues a payer known only by name, with that flat suggested first", () => {
    const d = decide(row("UPI/CR/2/SWATI JOSHI/swati.j@ybl/rent", 1_301_500, "N4"), ctx());
    expect(d.status).toBe("QUEUED");
    expect(d.candidates[0]).toEqual({ flatCode: "T12-0408", why: "Payer name and amount match" });
    expect(d.reasons.join(" ")).toContain("isn't registered");
  });

  it("queues a reference to a flat that doesn't exist", () => {
    const d = decide(row("NEFT CR-T31-0101 MAINT", 600_000, "N5"), ctx());
    expect(d.status).toBe("QUEUED");
    expect(d.reasons.join(" ")).toContain("T31-0101");
  });

  it("queues an unusually large amount even when the flat is clear", () => {
    const d = decide(row("RTGS CR-T07-1203 ADVANCE", 15_000_000, "N6"), ctx());
    expect(d.status).toBe("QUEUED");
    expect(d.candidates[0].flatCode).toBe("T07-1203");
  });

  it("auto-posts a modest overpayment and keeps the rest as advance", () => {
    const d = decide(row("NEFT T07-1203 2 MONTHS", 1_495_000, "N7"), ctx());
    expect(d.status).toBe("AUTO_POSTED");
    expect(d.reasons.join(" ")).toContain("advance");
  });

  it("does not post a gateway settlement again", () => {
    const c = ctx({ gatewaySettlements: new Map([["SETL_20261105", { paise: 2_000_000, count: 3 }]]) });
    const d = decide(row("PG SETTLEMENT TESTPG SETL_20261105", 2_000_000, "SETL_20261105"), c);
    expect(d.status).toBe("ALREADY_POSTED");
  });

  it("queues a gateway settlement whose amount differs from the app's records", () => {
    const c = ctx({ gatewaySettlements: new Map([["SETL_20261105", { paise: 2_000_000, count: 3 }]]) });
    expect(decide(row("PG SETTLEMENT SETL_20261105", 1_950_000, "SETL_20261105"), c).status).toBe("QUEUED");
  });

  it("does not post a UTR that is already on the ledger (overlapping statements)", () => {
    const c = ctx({ postedReferences: new Map([["430611000101", "receipt RCT-000101"]]) });
    const d = decide(row("UPI/CR/430611000101/NEERAJ/neeraj.kulkarni@okhdfcbank", 747_500, "430611000101"), c);
    expect(d.status).toBe("ALREADY_POSTED");
  });

  it("marks a row seen before as duplicate, by fingerprint or bank reference", () => {
    const r = row("UPI/CR/9/NEERAJ/neeraj.kulkarni@okhdfcbank", 747_500, "999");
    expect(decide(r, ctx({ seenFingerprints: new Set([r.fingerprint]) })).status).toBe("DUPLICATE");
    expect(decide(r, ctx({ seenReferences: new Set(["999"]) })).status).toBe("DUPLICATE");
  });

  it("ignores debits", () => {
    expect(decide(row("ACH DR LIFT AMC VENDOR", -4_800_000, "D1"), ctx()).status).toBe("IGNORED");
  });
});

describe("CSV parsing", () => {
  const csv = [
    "Account statement for federation account (sample)",
    "Account No: XXXXXXXX1234",
    "Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance",
    '03/11/2026,03/11/2026,"UPI/CR/1/NEERAJ/neeraj.kulkarni@okhdfcbank",430611000101,,"7,475.00","1,20,000.00"',
    "04-11-2026,04-11-2026,BANK CHARGES,,590.00,,1,19,410.00",
    "05 Nov 2026,05 Nov 2026,NEFT CR T21-1601,N1,,3000,",
    "Closing balance,,,,,,",
  ].join("\n");

  it("finds the header below account details, reads Indian number formats and day-first dates", () => {
    const { rows, errors } = parseStatementCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ amountPaise: 747_500, reference: "430611000101" });
    expect(rows[0].txnDate).toEqual(utcDate(2026, 11, 3));
    expect(rows[1].amountPaise).toBe(-59_000);
    expect(rows[2].txnDate).toEqual(utcDate(2026, 11, 5));
  });

  it("rejects a file without a credit column", () => {
    expect(parseStatementCsv("Date,Narration\n01/11/2026,x").errors[0]).toContain("Credit");
  });

  it("reports unreadable dates by row", () => {
    const { errors } = parseStatementCsv("Date,Narration,Credit\n31/02/2026,x,100");
    expect(errors[0]).toContain("Row 1");
  });
});
