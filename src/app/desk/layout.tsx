import { MessageSquareWarning, Landmark, FileSpreadsheet, Building2, BarChart3, LogOut } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { SideNav } from "@/components/NavTabs";
import { Logo } from "@/components/Logo";
import { signOut } from "@/app/login/actions";

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const s = await requireRole("STAFF");
  const [open, queued] = await Promise.all([
    prisma.complaint.count({ where: { status: { in: ["ASSIGNED", "IN_PROGRESS"] }, duplicateOfId: null } }),
    prisma.bankLine.count({ where: { status: "QUEUED" } }),
  ]);
  const items = [
    { href: "/desk", label: "Complaints", icon: <MessageSquareWarning size={18} />, badge: open, exact: true },
    { href: "/desk/reconcile", label: "Bank matching", icon: <Landmark size={18} />, badge: queued },
    { href: "/desk/billing", label: "Billing", icon: <FileSpreadsheet size={18} /> },
    { href: "/desk/flats", label: "Flats", icon: <Building2 size={18} /> },
    { href: "/committee", label: "Committee report", icon: <BarChart3 size={18} /> },
  ];
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="no-print border-b border-line bg-canvas lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-3 lg:px-5 lg:py-5">
          <Logo />
          <form action={signOut} className="lg:hidden">
            <button className="rounded-lg p-2 text-ink-3 hover:bg-sunken" aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </form>
        </div>
        <div className="px-3 pb-3 lg:px-3">
          <SideNav items={items} />
        </div>
        <div className="absolute bottom-0 hidden w-[232px] border-t border-line p-4 lg:block">
          <p className="text-sm font-medium">{s.name}</p>
          <p className="text-xs text-ink-3">Help desk · accounts</p>
          <form action={signOut} className="mt-3">
            <button className="flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
              <LogOut size={14} /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
