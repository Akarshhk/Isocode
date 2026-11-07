import Papa from "papaparse";
import { createHash } from "node:crypto";
import { isoDate, parseStatementDate } from "../dates";
import { parseAmountToPaise } from "../money";

export type StatementRow = {
  rowNumber: number; // 1-based data row number in the file (header excluded)
  txnDate: Date;
  narration: string;
  reference: string | null;
  amountPaise: number; // credit positive, debit negative
  fingerprint: string;
};

export type ParseResult = { rows: StatementRow[]; errors: string[] };

export const MAX_ROWS = 5000;

const HEADER_HINTS = {
  date: [/^txn ?date$/, /^transaction ?date$/, /^date$/, /^value ?date$/, /date/],
  narration: [/narration/, /description/, /particulars/, /remarks/, /details/],
  reference: [/utr/, /ref/, /chq|cheque/],
  debit: [/^debit/, /withdrawal/, /^dr\b/, /debit/],
  credit: [/^credit/, /deposit/, /^cr\b/, /credit/],
};

function findColumn(headers: string[], patterns: RegExp[], taken: Set<number>): number {
  for (const re of patterns) {
    const i = headers.findIndex((h, idx) => !taken.has(idx) && re.test(h));
    if (i >= 0) {
      taken.add(i);
      return i;
    }
  }
  return -1;
}

export function fingerprintOf(date: Date, amountPaise: number, reference: string | null, narration: string) {
  const norm = narration.toUpperCase().replace(/\s+/g, " ").trim();
  return createHash("sha256")
    .update(`${isoDate(date)}|${amountPaise}|${reference ?? ""}|${norm}`)
    .digest("hex");
}

/** Parses a bank statement CSV with Date, Narration, Ref, Debit, Credit columns (names vary by bank). */
export function parseStatementCsv(text: string): ParseResult {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const data = parsed.data.filter((r) => r.some((c) => c.trim() !== ""));
  if (data.length < 2) return { rows: [], errors: ["The file has no transaction rows."] };

  // Some banks put a few lines of account details above the table: find the header row.
  const headerIdx = data.findIndex(
    (r) => r.some((c) => /date/i.test(c)) && r.some((c) => /narration|description|particulars|remarks/i.test(c)),
  );
  if (headerIdx < 0) {
    return { rows: [], errors: ["Couldn't find a header row with Date and Narration/Description columns."] };
  }
  const headers = data[headerIdx].map((h) => h.trim().toLowerCase());
  const taken = new Set<number>();
  const col = {
    date: findColumn(headers, HEADER_HINTS.date, taken),
    narration: findColumn(headers, HEADER_HINTS.narration, taken),
    reference: findColumn(headers, HEADER_HINTS.reference, taken),
    debit: findColumn(headers, HEADER_HINTS.debit, taken),
    credit: findColumn(headers, HEADER_HINTS.credit, taken),
  };
  if (col.credit < 0) return { rows: [], errors: ["Couldn't find a Credit / Deposit column."] };

  const body = data.slice(headerIdx + 1);
  if (body.length > MAX_ROWS) {
    return { rows: [], errors: [`The file has ${body.length} rows; the limit is ${MAX_ROWS} per upload.`] };
  }

  const rows: StatementRow[] = [];
  const errors: string[] = [];
  body.forEach((r, i) => {
    const rowNumber = i + 1;
    const date = parseStatementDate(r[col.date] ?? "");
    const narration = (r[col.narration] ?? "").trim();
    const credit = parseAmountToPaise(r[col.credit]);
    const debit = col.debit >= 0 ? parseAmountToPaise(r[col.debit]) : null;
    if (!date) {
      // Footer lines such as "Closing balance" have no date: skip them quietly.
      if (narration || credit || debit) errors.push(`Row ${rowNumber}: unreadable date "${r[col.date] ?? ""}".`);
      return;
    }
    const amountPaise = credit && credit > 0 ? credit : debit && debit > 0 ? -debit : 0;
    const reference = col.reference >= 0 ? (r[col.reference] ?? "").trim() || null : null;
    rows.push({
      rowNumber,
      txnDate: date,
      narration: narration.slice(0, 500),
      reference: reference?.slice(0, 80) ?? null,
      amountPaise,
      fingerprint: fingerprintOf(date, amountPaise, reference, narration),
    });
  });
  return { rows, errors };
}
