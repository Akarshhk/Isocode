import { formatINR } from "../money";
import { extractFlatCodes, extractSettlementId, extractVpas, nameAppears } from "./refs";
import type { StatementRow } from "./parse";

export type MatchFlat = {
  id: string;
  code: string;
  residentNames: string[];
  monthlyBillPaise: number;
  duePaise: number; // total due right now, including interest
};

export type MatchContext = {
  flatsByCode: Map<string, MatchFlat>;
  flatsById: Map<string, MatchFlat>;
  vpaToFlatId: Map<string, string>;
  /** UTRs / gateway refs of payments already on the ledger -> receipt label. */
  postedReferences: Map<string, string>;
  /** Test-gateway settlement batch -> total paise of the payments in it. */
  gatewaySettlements: Map<string, { paise: number; count: number }>;
  /** Fingerprints and bank references of rows imported before (or earlier in this file). */
  seenFingerprints: Set<string>;
  seenReferences: Set<string>;
};

export type Candidate = { flatCode: string; why: string };

export type Decision = {
  status: "AUTO_POSTED" | "ALREADY_POSTED" | "QUEUED" | "IGNORED" | "DUPLICATE";
  flatId?: string;
  reasons: string[];
  candidates: Candidate[];
};

/** A clear payer who sends more than this many months' bills beyond what they owe goes to the queue. */
export const UNUSUAL_MONTHS = 3;

/**
 * Decides what to do with one bank-statement row. Pure: no I/O.
 * The order of checks is the decision table in plan.md section 4b. Amount alone never posts.
 */
export function decide(row: StatementRow, ctx: MatchContext): Decision {
  const ref = row.reference?.trim() || null;

  if (ctx.seenFingerprints.has(row.fingerprint)) {
    return { status: "DUPLICATE", reasons: ["Same row was already imported (date, amount, reference and narration all match)."], candidates: [] };
  }
  if (ref && ctx.seenReferences.has(ref.toUpperCase())) {
    return { status: "DUPLICATE", reasons: [`Bank reference ${ref} was already imported in an earlier statement.`], candidates: [] };
  }
  if (row.amountPaise <= 0) {
    return { status: "IGNORED", reasons: ["Debit or zero-value row: not a maintenance receipt."], candidates: [] };
  }

  const settlement = extractSettlementId(`${row.narration} ${ref ?? ""}`);
  if (settlement) {
    const known = ctx.gatewaySettlements.get(settlement);
    if (!known) {
      return { status: "QUEUED", reasons: [`Gateway settlement ${settlement} has no matching online payments in the app.`], candidates: [] };
    }
    if (known.paise !== row.amountPaise) {
      return {
        status: "QUEUED",
        reasons: [
          `Gateway settlement ${settlement} is ${formatINR(row.amountPaise)}, but the app recorded ${formatINR(known.paise)} across ${known.count} online payments.`,
        ],
        candidates: [],
      };
    }
    return {
      status: "ALREADY_POSTED",
      reasons: [
        `Settlement of ${known.count} online payment${known.count === 1 ? "" : "s"}. Each was posted to its flat when it was paid, so nothing is posted again.`,
      ],
      candidates: [],
    };
  }

  const refs = [ref, ...row.narration.split(/[\s/|-]+/)].filter(Boolean).map((s) => s!.toUpperCase());
  const postedRef = refs.find((r) => ctx.postedReferences.has(r));
  if (postedRef) {
    return {
      status: "ALREADY_POSTED",
      reasons: [`Reference ${postedRef} is already on the ledger (${ctx.postedReferences.get(postedRef)}). Not posted twice.`],
      candidates: [],
    };
  }

  const reasons: string[] = [];
  const vpas = extractVpas(row.narration);
  const codes = extractFlatCodes(row.narration);
  const byVpa = new Map<string, string>(); // flatId -> vpa
  for (const v of vpas) {
    const flatId = ctx.vpaToFlatId.get(v);
    if (flatId) byVpa.set(flatId, v);
    else reasons.push(`UPI ID ${v} isn't registered to any flat.`);
  }
  const byCode = new Map<string, string>(); // flatId -> code
  const invalidCodes: string[] = [];
  for (const c of codes) {
    const f = ctx.flatsByCode.get(c);
    if (f) byCode.set(f.id, c);
    else invalidCodes.push(c);
  }
  for (const c of invalidCodes) reasons.push(`Reference mentions ${c}, which isn't a flat in the township.`);

  const strong = new Set([...byVpa.keys(), ...byCode.keys()]);

  if (strong.size > 1) {
    const candidates = [...strong].map((id) => {
      const f = ctx.flatsById.get(id)!;
      const why = [byVpa.has(id) ? `UPI ID ${byVpa.get(id)}` : null, byCode.has(id) ? "reference" : null]
        .filter(Boolean)
        .join(" + ");
      return { flatCode: f.code, why: `Named by ${why}` };
    });
    return {
      status: "QUEUED",
      reasons: [...reasons, `Conflicting identifiers: ${candidates.map((c) => c.flatCode).join(" vs ")}. A person must decide.`],
      candidates,
    };
  }

  if (strong.size === 1) {
    const flatId = [...strong][0];
    const flat = ctx.flatsById.get(flatId)!;
    if (byVpa.has(flatId)) reasons.unshift(`UPI ID ${byVpa.get(flatId)} is registered to ${flat.code}.`);
    if (byCode.has(flatId)) reasons.unshift(`Reference names ${flat.code}.`);

    const limit = flat.duePaise + UNUSUAL_MONTHS * flat.monthlyBillPaise;
    if (row.amountPaise > limit) {
      return {
        status: "QUEUED",
        reasons: [
          ...reasons,
          `${formatINR(row.amountPaise)} is far more than ${flat.code} owes (${formatINR(flat.duePaise)}) plus ${UNUSUAL_MONTHS} months' bills. Check before posting.`,
        ],
        candidates: [{ flatCode: flat.code, why: "Identified flat, unusual amount" }],
      };
    }
    if (flat.duePaise === 0) reasons.push(`Nothing was due; ${formatINR(row.amountPaise)} is kept as advance credit.`);
    else if (row.amountPaise === flat.duePaise) reasons.push(`Pays the full ${formatINR(flat.duePaise)} due.`);
    else if (row.amountPaise < flat.duePaise)
      reasons.push(`Part payment: ${formatINR(row.amountPaise)} of ${formatINR(flat.duePaise)} due.`);
    else
      reasons.push(
        `Pays ${formatINR(flat.duePaise)} due; the extra ${formatINR(row.amountPaise - flat.duePaise)} is kept as advance credit.`,
      );
    return { status: "AUTO_POSTED", flatId, reasons, candidates: [] };
  }

  // No strong identifier: suggest, never post.
  const nameHits = new Set<string>();
  const amountHits = new Set<string>();
  for (const f of ctx.flatsById.values()) {
    if (f.residentNames.some((n) => nameAppears(row.narration, n))) nameHits.add(f.id);
    if (f.duePaise > 0 && f.duePaise === row.amountPaise) amountHits.add(f.id);
    else if (f.monthlyBillPaise === row.amountPaise && f.duePaise > 0) amountHits.add(f.id);
  }
  const scored = [...new Set([...nameHits, ...amountHits])]
    .map((id) => {
      const f = ctx.flatsById.get(id)!;
      const n = nameHits.has(id);
      const a = amountHits.has(id);
      return { f, score: (n ? 2 : 0) + (a ? 1 : 0), why: n && a ? "Payer name and amount match" : n ? "Payer name matches a resident" : "Amount matches what this flat owes" };
    })
    .sort((x, y) => y.score - x.score || x.f.code.localeCompare(y.f.code));

  if (amountHits.size > 1 && nameHits.size === 0) {
    reasons.push(
      `${formatINR(row.amountPaise)} matches ${amountHits.size} flats. Many flats share a layout and a bill, so the amount alone can't identify the payer.`,
    );
  } else if (scored.length === 0) {
    reasons.push("No UPI ID, flat reference, resident name or amount matches a flat.");
  } else if (nameHits.size > 0) {
    reasons.push("Only weak signals (payer name or amount): suggested, not posted.");
  } else {
    reasons.push("Only the amount matches: suggested, not posted.");
  }
  return {
    status: "QUEUED",
    reasons,
    candidates: scored.slice(0, 5).map((s) => ({ flatCode: s.f.code, why: s.why })),
  };
}
