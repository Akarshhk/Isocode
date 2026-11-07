// Runs the complaint pipeline (classify -> safety rule -> link -> assign) without the UI.
// Usage: npx tsx --conditions=react-server scripts/try-complaint.ts T12-0304 "Lift stuck again, people inside"
import { PrismaClient } from "@prisma/client";
import { raiseComplaint } from "../src/lib/complaints/service";

const prisma = new PrismaClient();
async function main() {
  const [code, text] = process.argv.slice(2);
  const flat = await prisma.flat.findUniqueOrThrow({ where: { code }, include: { members: true } });
  const c = await raiseComplaint({ flatId: flat.id, raisedById: flat.members[0].userId, description: text, photo: null });
  const full = await prisma.complaint.findUniqueOrThrow({ where: { id: c.id }, include: { assignee: true, duplicateOf: true, events: { orderBy: { at: "asc" } } } });
  console.log({
    number: full.number, category: full.category, urgency: full.urgency, scope: full.scope, classifiedBy: full.classifiedBy,
    needsReview: full.needsReview, safety: full.safetyKeyword, assignee: full.assignee?.name, linkedTo: full.duplicateOf?.number ?? null,
  });
  for (const e of full.events) console.log(" -", e.type, e.message);
}
main().finally(() => prisma.$disconnect());
