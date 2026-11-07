import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { Logo } from "@/components/Logo";
import { signOut } from "@/app/login/actions";

export default async function CommitteeLayout({ children }: { children: React.ReactNode }) {
  const s = await requireRole("COMMITTEE", "STAFF");
  return (
    <div className="min-h-dvh">
      <header className="no-print border-b border-line bg-canvas">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Logo />
            {s.role === "STAFF" && (
              <Link href="/desk" className="text-sm text-ink-3 hover:text-ink">
                ← Help desk
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-3 sm:inline">
              {s.name} · {s.role === "COMMITTEE" ? "Committee" : "Help desk"}
            </span>
            <form action={signOut}>
              <button className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Sign out">
                <LogOut size={16} /> <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
