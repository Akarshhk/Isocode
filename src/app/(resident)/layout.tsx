import { Home, IndianRupee, MessageSquareWarning, LogOut } from "lucide-react";
import { requireResident } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { BottomTabs } from "@/components/NavTabs";
import { LogoMark } from "@/components/Logo";
import { signOut } from "@/app/login/actions";

export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const session = await requireResident();
  const [flat, openComplaints] = await Promise.all([
    prisma.flat.findUnique({ where: { id: session.flatId }, select: { code: true } }),
    prisma.complaint.count({ where: { flatId: session.flatId, status: "RESOLVED" } }),
  ]);
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="num text-[15px] font-semibold tracking-tight">{flat?.code}</span>
          </div>
          <form action={signOut}>
            <button className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Sign out">
              <LogOut size={16} aria-hidden /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pb-28 pt-5">{children}</main>
      <BottomTabs
        items={[
          { href: "/home", label: "Home", icon: <Home size={22} strokeWidth={1.8} /> },
          { href: "/dues", label: "Dues", icon: <IndianRupee size={22} strokeWidth={1.8} /> },
          { href: "/complaints", label: "Complaints", icon: <MessageSquareWarning size={22} strokeWidth={1.8} />, badge: openComplaints },
        ]}
      />
    </div>
  );
}
