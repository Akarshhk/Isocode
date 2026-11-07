import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { allStatements } from "@/lib/ledger";
import { Card, EmptyState, PageHeader, Pill, inputClass } from "@/components/ui";
import { formatINR } from "@/lib/money";

export const metadata: Metadata = { title: "Flats" };

export default async function FlatsPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  await requireRole("STAFF");
  const { q = "", filter } = await searchParams;
  const term = q.trim().slice(0, 40);
  const [flats, statements] = await Promise.all([
    prisma.flat.findMany({
      where: term
        ? { OR: [{ code: { contains: term, mode: "insensitive" } }, { members: { some: { user: { name: { contains: term, mode: "insensitive" } } } } }] }
        : undefined,
      include: { members: { include: { user: { select: { name: true } } } } },
      orderBy: { code: "asc" },
    }),
    allStatements(prisma),
  ]);
  const rows = flats
    .map((f) => ({ f, st: statements.get(f.id) }))
    .filter(({ st }) => (filter === "overdue" ? (st?.oldestOverdueDays ?? 0) > 0 : true))
    .sort((a, b) => (filter === "overdue" ? (b.st?.oldestOverdueDays ?? 0) - (a.st?.oldestOverdueDays ?? 0) : 0));

  return (
    <div>
      <PageHeader title="Flats" sub={`${flats.length} flats${term ? ` matching "${term}"` : ""}`} />
      <form className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <label htmlFor="q" className="sr-only">
            Search flats
          </label>
          <input id="q" name="q" defaultValue={term} placeholder="Flat code or resident name" className={`${inputClass} pl-9`} />
        </div>
        <select name="filter" defaultValue={filter ?? ""} className={`${inputClass} w-auto`} aria-label="Filter">
          <option value="">All flats</option>
          <option value="overdue">Overdue only</option>
        </select>
        <button className="rounded-xl bg-ink px-4 text-sm font-medium text-white">Search</button>
      </form>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Search size={20} />} title="No flats found" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ f, st }) => (
              <li key={f.id}>
                <Link href={`/desk/flats/${f.code}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken/60 sm:px-5">
                  <span className="num w-24 text-sm font-medium">{f.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{f.members.map((m) => m.user.name).join(", ")}</span>
                  {st && st.oldestOverdueDays > 0 && <Pill tone="danger">{st.oldestOverdueDays}d overdue</Pill>}
                  <span className="num w-24 text-right text-sm">{st && st.totalDuePaise > 0 ? formatINR(st.totalDuePaise) : <span className="text-ink-3">Paid up</span>}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
