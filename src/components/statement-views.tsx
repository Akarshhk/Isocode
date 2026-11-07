import Link from "next/link";
import type { BillState, LedgerLine } from "@/lib/billing";
import { formatINR } from "@/lib/money";
import { formatDate, formatDayMonth, periodLabel } from "@/lib/dates";
import { receiptNo } from "@/lib/ledger";
import { Pill, EmptyState } from "./ui";
import { FileText } from "lucide-react";

export function BillStatusPill({ bill }: { bill: BillState }) {
  if (bill.status === "PAID") return <Pill tone="ok">Paid</Pill>;
  if (bill.status === "NOT_DUE") return <Pill>Due {formatDayMonth(bill.dueOn)}</Pill>;
  if (bill.daysOverdue > 0) return <Pill tone="danger">{bill.status === "PART_PAID" ? "Part paid · " : ""}{bill.daysOverdue}d overdue</Pill>;
  return <Pill tone="warn">Part paid</Pill>;
}

export function BillsList({ bills }: { bills: BillState[] }) {
  if (bills.length === 0) return <EmptyState icon={<FileText size={20} />} title="No bills yet" />;
  return (
    <ul className="divide-y divide-line">
      {bills.map((b) => (
        <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div>
            <p className="text-sm font-medium">{periodLabel(b.period)}</p>
            <p className="text-xs text-ink-3">
              Due {formatDate(b.dueOn)}
              {b.paidPaise > 0 && b.remainingPaise > 0 && <> · {formatINR(b.paidPaise)} paid</>}
            </p>
          </div>
          <div className="text-right">
            <p className="num text-sm font-medium">{formatINR(b.amountPaise)}</p>
            <div className="mt-0.5">
              <BillStatusPill bill={b} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LedgerTable({ lines, receiptLinks = true }: { lines: LedgerLine[]; receiptLinks?: boolean }) {
  if (lines.length === 0) return <EmptyState icon={<FileText size={20} />} title="No entries yet" />;
  const rows = [...lines].reverse();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-3">
            <th className="px-4 py-2 font-medium sm:px-5">Date</th>
            <th className="px-2 py-2 font-medium">Entry</th>
            <th className="px-2 py-2 text-right font-medium">Amount</th>
            <th className="px-4 py-2 text-right font-medium sm:px-5">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((l, i) => (
            <tr key={i}>
              <td className="num whitespace-nowrap px-4 py-2.5 text-ink-3 sm:px-5">{formatDayMonth(l.date)}</td>
              <td className="px-2 py-2.5">
                {l.label}
                {l.paymentId && receiptLinks && (
                  <Link href={`/receipts/${l.paymentId}`} className="num ml-1.5 text-xs text-brand hover:underline">
                    {receiptNo(l.paymentId)}
                  </Link>
                )}
              </td>
              <td className={`num whitespace-nowrap px-2 py-2.5 text-right ${l.creditPaise ? "text-ok" : ""}`}>
                {l.creditPaise ? `−${formatINR(l.creditPaise)}` : formatINR(l.debitPaise)}
              </td>
              <td className="num whitespace-nowrap px-4 py-2.5 text-right text-ink-2 sm:px-5">
                {l.balancePaise < 0 ? `${formatINR(-l.balancePaise)} cr` : formatINR(l.balancePaise)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
