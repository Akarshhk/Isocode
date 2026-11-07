"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./ui";

export type NavItem = { href: string; label: string; icon: ReactNode; badge?: number; exact?: boolean };

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Phone bottom bar for residents. */
export function BottomTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-brand" : "text-ink-3 hover:text-ink")}
              >
                <span className="relative">
                  {item.icon}
                  {!!item.badge && (
                    <span className="num absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] text-white">{item.badge}</span>
                  )}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Sidebar on desktop, scrollable tab row on phones. Used by the desk. */
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
                  active ? "bg-surface text-ink shadow-[var(--shadow-card)] ring-1 ring-line" : "text-ink-2 hover:bg-sunken hover:text-ink",
                )}
              >
                <span className={active ? "text-brand" : "text-ink-3"}>{item.icon}</span>
                <span className="whitespace-nowrap">{item.label}</span>
                {!!item.badge && <span className="num ml-auto rounded-full bg-sunken px-1.5 text-xs text-ink-2">{item.badge}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
