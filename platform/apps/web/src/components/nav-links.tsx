"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookMarked, CalendarCheck, FlaskConical, GraduationCap, Map, RotateCcw, Search, Settings, Shield, Timer, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

const ICONS = {
  today: CalendarCheck,
  path: Map,
  progress: TrendingUp,
  certs: GraduationCap,
  review: RotateCcw,
  search: Search,
  saved: BookMarked,
  labs: FlaskConical,
  mocks: Timer,
  account: Settings,
  admin: Shield,
};

export interface NavItem {
  key: keyof typeof ICONS;
  href: string;
  label: string;
  badge?: number;
  disabled?: string;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ items, secondary }: { items: NavItem[]; secondary: NavItem[] }) {
  const pathname = usePathname();
  const render = (item: NavItem) => {
    const Icon = ICONS[item.key];
    if (item.disabled) {
      return (
        <li key={item.key}>
          <span className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground" aria-disabled="true">
            <Icon aria-hidden="true" className="size-4" />
            <span className="flex flex-col">
              <span>{item.label}</span>
              <span className="text-xs">{item.disabled}</span>
            </span>
          </span>
        </li>
      );
    }
    const active = isActive(pathname, item.href);
    return (
      <li key={item.key}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm no-underline",
            active ? "bg-primary-soft font-semibold text-primary" : "text-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
          <span className="flex-1">{item.label}</span>
          {item.badge ? (
            <span className="rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">
              {item.badge}
              <span className="sr-only"> due</span>
            </span>
          ) : null}
        </Link>
      </li>
    );
  };
  return (
    <nav aria-label={en.nav.main} className="flex flex-1 flex-col justify-between gap-6">
      <ul className="flex flex-col gap-1">{items.map(render)}</ul>
      <ul className="flex flex-col gap-1">{secondary.map(render)}</ul>
    </nav>
  );
}

/** Phones: five items in a bottom bar. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={`${en.nav.main} (mobile)`} className="fixed inset-x-0 bottom-0 z-40 border-t bg-card lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const Icon = ICONS[item.key];
          const active = isActive(pathname, item.href);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs no-underline",
                  active ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
