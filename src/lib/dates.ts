// Calendar-date helpers. Bills and payments are date-only values stored as UTC midnight
// (Postgres DATE), and "today" is the calendar date in India (Asia/Kolkata).

const DAY_MS = 86_400_000;
const IST = "Asia/Kolkata";

export function utcDate(year: number, month1: number, day: number): Date {
  return new Date(Date.UTC(year, month1 - 1, day));
}

/** Today's calendar date in India, as a UTC-midnight Date. */
export function todayIST(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return utcDate(get("year"), get("month"), get("day"));
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Whole days from a to b (b - a). Both must be date-only values. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "2026-10" for a date-only value. */
export function periodOf(d: Date): string {
  return isoDate(d).slice(0, 7);
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function periodStart(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return utcDate(y, m, 1);
}

export function periodLabel(period: string): string {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    periodStart(period),
  );
}

export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function formatDayMonth(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

/** Timestamp shown in India time, e.g. "6 Nov, 4:05 pm". */
export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: IST,
  }).format(d);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parses the date formats Indian bank exports use: 06/11/2026, 06-11-2026, 06-11-26,
 * 2026-11-06 and 06 Nov 2026 / 06-Nov-2026. Day-first, never US month-first.
 */
export function parseStatementDate(raw: string): Date | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return valid(y, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return month ? valid(y, month, Number(m[1])) : null;
  }
  return null;
}

function valid(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = utcDate(y, m, d);
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}
