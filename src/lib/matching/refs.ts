// Pulls identifiers out of free-text bank narrations.

/** Normalised flat code: "T07-1203". */
export function flatCode(tower: number | string, flat: number | string): string {
  return `T${String(Number(tower)).padStart(2, "0")}-${String(Number(flat)).padStart(4, "0")}`;
}

const FLAT_PATTERNS: RegExp[] = [
  // T07-1203, T7/1203, T-7 1203, TWR 7 FLAT 1203, TOWER 07 - 1203
  /\bT(?:WR|OWER)?[\s\-/.]*(\d{1,2})[\s\-/.,]+(?:FLAT|FL|F)?[\s\-/.]*(\d{3,4})\b/g,
  // T071203 (compact, two-digit tower + four-digit flat)
  /\bT(\d{2})(\d{4})\b/g,
  // FLAT 1203 T7, FLAT-1203 TOWER 07
  /\bFLAT[\s\-/.]*(\d{3,4})[\s\-/.,]+T(?:WR|OWER)?[\s\-/.]*(\d{1,2})\b/g,
];

/** All flat codes that appear in a narration, normalised, in order, without repeats. */
export function extractFlatCodes(narration: string): string[] {
  const text = narration.toUpperCase();
  const found: string[] = [];
  FLAT_PATTERNS.forEach((re, i) => {
    for (const m of text.matchAll(re)) {
      const code = i === 2 ? flatCode(m[2], m[1]) : flatCode(m[1], m[2]);
      if (!found.includes(code)) found.push(code);
    }
  });
  return found;
}

/** UPI IDs (VPAs) in a narration, lower-cased. */
export function extractVpas(narration: string): string[] {
  const out: string[] = [];
  for (const m of narration.matchAll(/([a-zA-Z0-9][a-zA-Z0-9._-]{1,}@[a-zA-Z][a-zA-Z0-9]{1,})/g)) {
    const vpa = m[1].toLowerCase();
    if (!out.includes(vpa)) out.push(vpa);
  }
  return out;
}

/** Gateway settlement batch id, e.g. "SETL_20261106". */
export function extractSettlementId(text: string): string | null {
  const m = /\bSETL_(\d{8})\b/i.exec(text);
  return m ? `SETL_${m[1]}` : null;
}

/** Letters only, upper-case: "Swati Joshi" -> "SWATIJOSHI". Used for payer-name matching. */
export function lettersOnly(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, "");
}

/** True when every word of the person's name (2+ letters) appears in the narration. */
export function nameAppears(narration: string, personName: string): boolean {
  const hay = lettersOnly(narration);
  const words = personName
    .split(/\s+/)
    .map(lettersOnly)
    .filter((w) => w.length >= 2);
  if (words.length < 2) return false;
  return hay.includes(words.join("")) || words.every((w) => hay.includes(w));
}
