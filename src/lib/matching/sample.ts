import "server-only";
import { prisma } from "@/lib/db";
import { allStatements } from "@/lib/ledger";
import { monthlyBillPaise } from "@/lib/billing";
import { addDays, formatDate, isoDate, todayIST } from "@/lib/dates";
import { SCENARIOS } from "./scenarios";
import { settlementIdFor } from "./importer";

type Row = { date: Date; narration: string; ref: string; debit?: number; credit?: number };

/**
 * Builds a realistic bank statement CSV from the current data, with one row for every matching
 * rule (see SCENARIOS). References are fixed per scenario, so uploading it twice is safe:
 * the second upload shows up as duplicates, not double payments.
 */
export async function buildSampleStatementCsv(): Promise<string> {
  const today = todayIST();
  const d = (n: number) => addDays(today, -n);
  const [flats, config, statements, payments, upis] = await Promise.all([
    prisma.flat.findMany({ include: { members: { include: { user: true } } }, orderBy: { code: "asc" } }),
    prisma.billingConfig.findFirst({ orderBy: { effectiveFrom: "desc" } }),
    allStatements(prisma),
    prisma.payment.findMany({ orderBy: { id: "asc" } }),
    prisma.upiHandle.findMany(),
  ]);
  const rate = config?.ratePaisePerSqft ?? 650;
  const byCode = new Map(flats.map((f) => [f.code, f]));
  const due = (code: string) => {
    const f = byCode.get(code);
    if (!f) return 0;
    const st = statements.get(f.id);
    return st && st.totalDuePaise > 0 ? st.totalDuePaise : monthlyBillPaise(f.areaSqft, rate);
  };
  const bill = (code: string) => monthlyBillPaise(byCode.get(code)?.areaSqft ?? 1000, rate);
  const name = (code: string) => byCode.get(code)?.members[0]?.user.name.toUpperCase() ?? "RESIDENT";
  const vpaOf = (code: string) => SCENARIOS.find((s) => s.code === code)?.vpa ?? "";

  const rows: Row[] = [];
  const has = (code: string) => byCode.has(code);

  // Routine UPI payments from registered UPI IDs (most bills arrive in the first days of the month).
  const scenarioCodes = new Set(SCENARIOS.map((s) => s.code));
  const routine = upis
    .map((u) => ({ u, f: flats.find((f) => f.id === u.flatId)! }))
    .filter(({ f }) => f && !scenarioCodes.has(f.code) && !["T07-1203", "T12-0408", "T21-1601"].includes(f.code))
    .filter(({ f }) => (statements.get(f.id)?.totalDuePaise ?? 0) > 0)
    .slice(0, 10);
  routine.forEach(({ u, f }, i) => {
    rows.push({
      date: d(6 - (i % 5)),
      narration: `UPI/CR/4306${String(110001 + i).padStart(8, "0")}/${f.members[0]?.user.name.toUpperCase()}/${u.vpa}/MAINTENANCE`,
      ref: `4306${String(110001 + i).padStart(8, "0")}`,
      credit: statements.get(f.id)!.totalDuePaise,
    });
  });

  if (has("T03-0502"))
    rows.push({ date: d(5), narration: `UPI/CR/430620000101/${name("T03-0502")}/${vpaOf("T03-0502")}/OCT MAINT`, ref: "430620000101", credit: due("T03-0502") });
  if (has("T05-0302"))
    rows.push({ date: d(5), narration: `NEFT CR-HDFC0001234-${name("T05-0302")}-T05-0302 MAINT OCT`, ref: "HDFCN26310455102", credit: due("T05-0302") });
  if (has("T07-0904"))
    rows.push({ date: d(4), narration: `IMPS/P2A/430620000303/${name("T07-0904").replace(" ", "")}/T7 904 maintenance`, ref: "430620000303", credit: 500000 });
  if (has("T09-0702"))
    rows.push({ date: d(4), narration: `UPI/CR/430620000404/${name("T09-0702")}/9876543210@ybl/TWR 9 FLAT 702`, ref: "430620000404", credit: due("T09-0702") });
  if (has("T11-1104"))
    rows.push({ date: d(3), narration: `NEFT CR-ICIC0000456-${name("T11-1104")}-T111104`, ref: "ICICN26310776104", credit: due("T11-1104") });
  if (has("T14-0201")) rows.push({ date: d(3), narration: "CHQ DEP 004512 T14-0201 CLEARING", ref: "004512", credit: due("T14-0201") });
  if (has("T16-0603"))
    rows.push({ date: d(3), narration: `UPI/CR/430620000707/${name("T16-0603")}/${vpaOf("T16-0603")}/T16-0306`, ref: "430620000707", credit: bill("T16-0306") });
  if (has("T18-1002"))
    rows.push({ date: d(2), narration: `UPI/CR/430620000909/${name("T18-1002")}/nikhil.g@okhdfcbank/oct maint`, ref: "430620000909", credit: due("T18-1002") });
  rows.push({ date: d(2), narration: "NEFT CR-SBIN0004321-MRS D MENON-MAINTENANCE", ref: "SBINN26310990201", credit: 637000 });
  rows.push({ date: d(2), narration: "NEFT CR-KKBK0000789-R SHARMA-T31-0101 MAINT", ref: "KKBKN26310990202", credit: 650000 });
  if (has("T20-1501")) rows.push({ date: d(1), narration: "RTGS CR-UTIB0000111-HARISH MENON-T20-1501 ADVANCE FY27", ref: "UTIBR26310112233", credit: 15000000 });
  if (has("T22-0802"))
    rows.push({ date: d(1), narration: `UPI/CR/430620001111/${name("T22-0802")}/${vpaOf("T22-0802")}/OCT+NOV`, ref: "430620001111", credit: due("T22-0802") + bill("T22-0802") });

  // A UPI credit already on the ledger: overlapping statement downloads.
  const posted = [...payments].reverse().find((p) => p.method === "BANK" && p.utr && !p.bankLineId);
  if (posted) {
    const f = flats.find((x) => x.id === posted.flatId)!;
    rows.push({ date: posted.paidOn, narration: `UPI/CR/${posted.utr}/${f.members[0]?.user.name.toUpperCase()}/MAINTENANCE`, ref: posted.utr!, credit: posted.amountPaise });
  }

  // Test-gateway settlements for the last 7 days: money already posted to flats when paid.
  const settlements = new Map<string, { date: Date; paise: number; count: number }>();
  for (const p of payments) {
    if (p.method !== "GATEWAY" || p.paidOn < d(7)) continue;
    const id = settlementIdFor(p.paidOn);
    const s = settlements.get(id) ?? { date: p.paidOn, paise: 0, count: 0 };
    settlements.set(id, { date: p.paidOn, paise: s.paise + p.amountPaise, count: s.count + 1 });
  }
  for (const [id, s] of settlements) {
    rows.push({ date: s.date, narration: `PG SETTLEMENT TESTPG ${id} ${s.count} TXNS`, ref: id, credit: s.paise });
  }

  // Outgoing payments, and one row the bank export repeated.
  rows.push({ date: d(4), narration: "ACH DR LIFT AMC VENDOR NOV-26", ref: "ACH0098812", debit: 4800000 });
  rows.push({ date: d(1), narration: "BANK CHARGES INCL GST", ref: "", debit: 59000 });
  if (rows.length > 0) rows.push({ ...rows[0] });

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());

  const money = (p?: number) => (p ? (p / 100).toFixed(2) : "");
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const dmy = (x: Date) => isoDate(x).split("-").reverse().join("/");
  let balance = 2_485_000_00;
  const lines = [
    "Federation maintenance collection account (sample statement)",
    `Period: ${formatDate(d(7))} to ${formatDate(today)}`,
    "",
    "Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance",
    ...rows.map((r) => {
      balance += (r.credit ?? 0) - (r.debit ?? 0);
      return [dmy(r.date), dmy(r.date), esc(r.narration), esc(r.ref), money(r.debit), money(r.credit), (balance / 100).toFixed(2)].join(",");
    }),
  ];
  return lines.join("\n") + "\n";
}
