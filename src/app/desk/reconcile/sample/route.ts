import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { buildSampleStatementCsv } from "@/lib/matching/sample";
import { isoDate, todayIST } from "@/lib/dates";

export async function GET() {
  const s = await getSession();
  if (s?.role !== "STAFF") return new NextResponse("Forbidden", { status: 403 });
  const csv = await buildSampleStatementCsv();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sample-bank-statement-${isoDate(todayIST())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
