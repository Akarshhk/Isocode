import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { allStatements } from "@/lib/ledger";
import { ageingBucket, monthlyBillPaise } from "@/lib/billing";
import { isoDate, todayIST } from "@/lib/dates";

// Flat-level dues for the committee. Flat codes and amounts only: no names or phone numbers.
export async function GET() {
  const s = await getSession();
  if (s?.role !== "COMMITTEE" && s?.role !== "STAFF") return new NextResponse("Forbidden", { status: 403 });
  const today = todayIST();
  const [flats, config, statements] = await Promise.all([
    prisma.flat.findMany({ orderBy: { code: "asc" } }),
    prisma.billingConfig.findFirst({ orderBy: { effectiveFrom: "desc" } }),
    allStatements(prisma, today),
  ]);
  const rupees = (p: number) => (p / 100).toFixed(2);
  const rows = [["Flat", "Area sq ft", "Monthly bill", "Maintenance outstanding", "Interest", "Total due", "Days overdue", "Ageing bucket"].join(",")];
  for (const f of flats) {
    const st = statements.get(f.id);
    if (!st) continue;
    rows.push(
      [
        f.code,
        f.areaSqft,
        rupees(monthlyBillPaise(f.areaSqft, config?.ratePaisePerSqft ?? 650)),
        rupees(st.outstandingPrincipalPaise),
        rupees(st.accruedInterestPaise + st.interestChargedUnpaidPaise),
        rupees(st.totalDuePaise),
        st.oldestOverdueDays,
        st.oldestOverdueDays > 0 ? ageingBucket(st.oldestOverdueDays) : "",
      ].join(","),
    );
  }
  return new NextResponse(rows.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dues-${isoDate(today)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
