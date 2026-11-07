import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { allStatements, receiptNo } from "@/lib/ledger";
import { monthlyBillPaise } from "@/lib/billing";
import { isoDate } from "@/lib/dates";
import { decide, type MatchContext, type MatchFlat } from "./match";
import type { StatementRow } from "./parse";

/** Builds everything `decide` needs from the database, in a handful of queries. */
export async function loadMatchContext(rows: StatementRow[]): Promise<MatchContext> {
  const [flats, config, upis, payments, statements, seen] = await Promise.all([
    prisma.flat.findMany({ include: { members: { include: { user: { select: { name: true } } } } } }),
    prisma.billingConfig.findFirst({ orderBy: { effectiveFrom: "desc" } }),
    prisma.upiHandle.findMany(),
    prisma.payment.findMany({ select: { id: true, utr: true, gatewayRef: true, method: true, paidOn: true, amountPaise: true } }),
    allStatements(prisma),
    prisma.bankLine.findMany({
      where: {
        OR: [
          { fingerprint: { in: rows.map((r) => r.fingerprint) } },
          { reference: { in: rows.map((r) => r.reference).filter((r): r is string => !!r) } },
        ],
        status: { not: "DUPLICATE" },
      },
      select: { fingerprint: true, reference: true },
    }),
  ]);

  const rate = config?.ratePaisePerSqft ?? 650;
  const matchFlats: MatchFlat[] = flats.map((f) => ({
    id: f.id,
    code: f.code,
    residentNames: f.members.map((m) => m.user.name),
    monthlyBillPaise: monthlyBillPaise(f.areaSqft, rate),
    duePaise: statements.get(f.id)?.totalDuePaise ?? 0,
  }));

  const postedReferences = new Map<string, string>();
  const gatewaySettlements = new Map<string, { paise: number; count: number }>();
  for (const p of payments) {
    if (p.utr) postedReferences.set(p.utr.toUpperCase(), `receipt ${receiptNo(p.id)}`);
    if (p.gatewayRef) postedReferences.set(p.gatewayRef.toUpperCase(), `receipt ${receiptNo(p.id)}`);
    if (p.method === "GATEWAY") {
      const id = settlementIdFor(p.paidOn);
      const s = gatewaySettlements.get(id) ?? { paise: 0, count: 0 };
      gatewaySettlements.set(id, { paise: s.paise + p.amountPaise, count: s.count + 1 });
    }
  }

  return {
    flatsByCode: new Map(matchFlats.map((f) => [f.code, f])),
    flatsById: new Map(matchFlats.map((f) => [f.id, f])),
    vpaToFlatId: new Map(upis.map((u) => [u.vpa.toLowerCase(), u.flatId])),
    postedReferences,
    gatewaySettlements,
    seenFingerprints: new Set(seen.map((s) => s.fingerprint).filter((f): f is string => !!f)),
    seenReferences: new Set(seen.map((s) => s.reference?.toUpperCase()).filter((r): r is string => !!r)),
  };
}

/** The test gateway settles each day's online payments as one bank credit. */
export function settlementIdFor(paidOn: Date): string {
  return `SETL_${isoDate(paidOn).replaceAll("-", "")}`;
}

export type ImportSummary = { importId: string; counts: Record<string, number> };

/**
 * Matches every row and writes the import, its lines and the auto-posted payments in one
 * transaction: either the whole statement is recorded or none of it is.
 */
export async function importStatement(filename: string, uploadedById: string, rows: StatementRow[]): Promise<ImportSummary> {
  const ctx = await loadMatchContext(rows);
  const decided = rows.map((row) => {
    const d = decide(row, ctx);
    // Later rows in the same file see earlier ones: in-file duplicates and updated dues.
    ctx.seenFingerprints.add(row.fingerprint);
    if (row.reference) ctx.seenReferences.add(row.reference.toUpperCase());
    if (d.status === "AUTO_POSTED" && d.flatId) {
      const f = ctx.flatsById.get(d.flatId)!;
      f.duePaise = Math.max(0, f.duePaise - row.amountPaise);
      if (row.reference) ctx.postedReferences.set(row.reference.toUpperCase(), "this statement");
    }
    return { row, d };
  });

  const counts: Record<string, number> = {};
  for (const { d } of decided) counts[d.status] = (counts[d.status] ?? 0) + 1;

  const importId = await prisma.$transaction(
    async (tx) => {
      const imp = await tx.bankImport.create({ data: { filename: filename.slice(0, 120), uploadedById, rowCount: rows.length } });
      const lines = await tx.bankLine.createManyAndReturn({
        data: decided.map(({ row, d }) => ({
          importId: imp.id,
          rowNumber: row.rowNumber,
          txnDate: row.txnDate,
          narration: row.narration,
          reference: row.reference,
          amountPaise: row.amountPaise,
          fingerprint: d.status === "DUPLICATE" ? null : row.fingerprint,
          status: d.status,
          flatId: d.flatId ?? null,
          reasons: d.reasons,
          candidates: d.candidates,
        })),
        select: { id: true, rowNumber: true, status: true, flatId: true, amountPaise: true, txnDate: true, reference: true },
      });
      const toPost = lines.filter((l) => l.status === "AUTO_POSTED" && l.flatId);
      if (toPost.length) {
        await tx.payment.createMany({
          data: toPost.map((l) => ({
            flatId: l.flatId!,
            amountPaise: l.amountPaise,
            method: "BANK" as const,
            paidOn: l.txnDate,
            utr: l.reference,
            bankLineId: l.id,
            note: "Matched automatically from bank statement",
          })),
        });
      }
      return imp.id;
    },
    { timeout: 30_000 },
  );
  return { importId, counts };
}

export function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
