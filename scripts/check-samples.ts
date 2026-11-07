// Prints the three sample flats' state so it can be compared with the client's sample data.
import { PrismaClient } from "@prisma/client";
import { flatStatement } from "../src/lib/ledger";
import { formatINR } from "../src/lib/money";

const prisma = new PrismaClient();
async function main() {
  for (const code of ["T07-1203", "T12-0408", "T21-1601"]) {
    const flat = await prisma.flat.findUniqueOrThrow({ where: { code }, include: { members: { include: { user: true } } } });
    const st = await flatStatement(prisma, flat.id);
    const oct = st.bills.find((b) => b.period === "2026-10")!;
    const open = await prisma.complaint.count({ where: { flatId: flat.id, status: { not: "CLOSED" } } });
    console.log(
      code, flat.members[0].user.name, flat.members[0].relation, flat.areaSqft, "sqft |",
      "bill", formatINR(oct.amountPaise), "| oct paid", formatINR(oct.paidPaise),
      "| oldest overdue", st.oldestOverdueDays, "days | interest accrued", formatINR(st.accruedInterestPaise),
      "| total due", formatINR(st.totalDuePaise), "| open complaints", open,
    );
  }
}
main().finally(() => prisma.$disconnect());
