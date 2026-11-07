import type { Metadata } from "next";
import Link from "next/link";
import { Download, CheckCircle2, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { UploadForm } from "./UploadForm";
import { QueueActions } from "./QueueItem";
import { formatINR } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { LINE_STATUS } from "@/components/line-status";

export const metadata: Metadata = { title: "Bank matching" };

export default async function ReconcilePage() {
  await requireRole("STAFF");
  const [queue, imports] = await Promise.all([
    prisma.bankLine.findMany({ where: { status: "QUEUED" }, orderBy: [{ txnDate: "asc" }, { rowNumber: "asc" }], take: 100, include: { import: { select: { filename: true } } } }),
    prisma.bankImport.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { lines: { select: { status: true } } } }),
  ]);
  const uploaders = await prisma.user.findMany({ where: { id: { in: imports.map((i) => i.uploadedById) } }, select: { id: true, name: true } });

  return (
    <div>
      <PageHeader
        title="Bank matching"
        sub="Credits are matched to flats by UPI ID and flat reference. Anything unclear waits here; it is never posted to a flat automatically."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title={`Accounts queue (${queue.length})`} sub="Pick the flat, or mark the credit as not maintenance." />
          {queue.length === 0 ? (
            <EmptyState icon={<CheckCircle2 size={20} />} title="Queue is clear">
              Every credit from the uploaded statements is on a ledger or set aside.
            </EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {queue.map((l) => {
                const reasons = (l.reasons as string[]) ?? [];
                const candidates = (l.candidates as { flatCode: string; why: string }[]) ?? [];
                return (
                  <li key={l.id} className="space-y-2 px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="num text-lg font-semibold">{formatINR(l.amountPaise)}</p>
                      <p className="num text-xs text-ink-3">
                        {formatDate(l.txnDate)} · {l.import.filename} row {l.rowNumber}
                      </p>
                    </div>
                    <p className="break-all rounded-lg bg-sunken px-2.5 py-1.5 font-mono text-xs text-ink-2">{l.narration}</p>
                    <ul className="space-y-0.5 text-sm text-warn">
                      {reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                    <QueueActions lineId={l.id} candidates={candidates} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-[15px] font-semibold">Upload a statement</h2>
            <UploadForm />
            <a href="/desk/reconcile/sample" className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-brand hover:underline">
              <Download size={14} /> Download a sample statement to try
            </a>
            <p className="mt-2 text-center text-xs text-ink-3">Built from today&apos;s data, with one row for every matching rule.</p>
          </Card>

          <Card>
            <CardHeader title="Recent uploads" />
            {imports.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-3">No statements uploaded yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {imports.map((imp) => {
                  const auto = imp.lines.filter((l) => l.status === "AUTO_POSTED").length;
                  const queued = imp.lines.filter((l) => l.status === "QUEUED").length;
                  return (
                    <li key={imp.id}>
                      <Link href={`/desk/reconcile/${imp.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{imp.filename}</p>
                          <p className="text-xs text-ink-3">
                            {formatDateTime(imp.createdAt)} · {uploaders.find((u) => u.id === imp.uploadedById)?.name}
                          </p>
                          <p className="num mt-0.5 text-xs text-ink-2">
                            {imp.lines.length} rows · {auto} {LINE_STATUS.AUTO_POSTED.label.toLowerCase()}
                            {queued > 0 && <span className="text-warn"> · {queued} in queue</span>}
                          </p>
                        </div>
                        <ChevronRight size={16} className="text-ink-3" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
