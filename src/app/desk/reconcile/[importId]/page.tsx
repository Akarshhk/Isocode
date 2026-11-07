import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, PageHeader, cx } from "@/components/ui";
import { LINE_STATUS, LineStatusPill } from "@/components/line-status";
import { formatINR } from "@/lib/money";
import { formatDayMonth, formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Statement results" };

const ORDER = ["AUTO_POSTED", "QUEUED", "RESOLVED", "ALREADY_POSTED", "DUPLICATE", "IGNORED"];

export default async function ImportPage({ params, searchParams }: { params: Promise<{ importId: string }>; searchParams: Promise<{ status?: string }> }) {
  await requireRole("STAFF");
  const { importId } = await params;
  const { status } = await searchParams;
  const imp = await prisma.bankImport.findUnique({ where: { id: importId }, include: { lines: { orderBy: { rowNumber: "asc" } } } });
  if (!imp) notFound();
  const flats = await prisma.flat.findMany({ where: { id: { in: imp.lines.map((l) => l.flatId).filter((x): x is string => !!x) } }, select: { id: true, code: true } });
  const codeOf = new Map(flats.map((f) => [f.id, f.code]));
  const counts = ORDER.map((s) => ({ s, n: imp.lines.filter((l) => l.status === s).length })).filter((x) => x.n > 0);
  const credits = imp.lines.filter((l) => l.amountPaise > 0);
  const autoPct = credits.length ? Math.round((imp.lines.filter((l) => l.status === "AUTO_POSTED").length / credits.length) * 100) : 0;
  const shown = status && ORDER.includes(status) ? imp.lines.filter((l) => l.status === status) : imp.lines;

  return (
    <div>
      <PageHeader back={{ href: "/desk/reconcile", label: "Bank matching" }} title={imp.filename} sub={`Uploaded ${formatDateTime(imp.createdAt)} · ${imp.rowCount} rows · ${autoPct}% of credits posted automatically`} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={`/desk/reconcile/${imp.id}`} className={cx("rounded-lg border px-3 py-1.5 text-sm", !status ? "border-ink bg-ink text-white" : "border-line bg-surface hover:bg-sunken")}>
          All <span className="num opacity-70">{imp.lines.length}</span>
        </Link>
        {counts.map(({ s, n }) => (
          <Link
            key={s}
            href={`/desk/reconcile/${imp.id}?status=${s}`}
            className={cx("rounded-lg border px-3 py-1.5 text-sm", status === s ? "border-ink bg-ink text-white" : "border-line bg-surface hover:bg-sunken")}
          >
            {LINE_STATUS[s].label} <span className="num opacity-70">{n}</span>
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-xs text-ink-3">
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-2 py-2.5 font-medium">Date</th>
                <th className="px-2 py-2.5 font-medium">Narration and decision</th>
                <th className="px-2 py-2.5 text-right font-medium">Amount</th>
                <th className="px-2 py-2.5 font-medium">Flat</th>
                <th className="px-4 py-2.5 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {shown.map((l) => (
                <tr key={l.id}>
                  <td className="num px-4 py-3 text-ink-3">{l.rowNumber}</td>
                  <td className="num whitespace-nowrap px-2 py-3 text-ink-3">{formatDayMonth(l.txnDate)}</td>
                  <td className="max-w-md px-2 py-3">
                    <p className="break-all font-mono text-xs text-ink-2">{l.narration}</p>
                    <p className="mt-1 text-xs text-ink-3">{((l.reasons as string[]) ?? []).join(" ")}</p>
                  </td>
                  <td className={cx("num whitespace-nowrap px-2 py-3 text-right", l.amountPaise < 0 && "text-ink-3")}>
                    {l.amountPaise < 0 ? `−${formatINR(-l.amountPaise)}` : formatINR(l.amountPaise)}
                  </td>
                  <td className="num whitespace-nowrap px-2 py-3">
                    {l.flatId ? (
                      <Link href={`/desk/flats/${codeOf.get(l.flatId)}`} className="text-brand hover:underline">
                        {codeOf.get(l.flatId)}
                      </Link>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <LineStatusPill status={l.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
