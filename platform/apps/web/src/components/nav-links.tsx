"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookMarked, CalendarCheck, CalendarRange, FlaskConical, GraduationCap, Home, LogIn, LogOut, Map, Menu, RotateCcw, Search, Settings, Shield, Timer, TrendingUp, UserPlus, X } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";
import { ThemeChoice } from "./theme-toggle";

const ICONS = {
  today: CalendarCheck,
  path: Map,
  plan: CalendarRange,
  progress: TrendingUp,
  certs: GraduationCap,
  review: RotateCcw,
  search: Search,
  saved: BookMarked,
  labs: FlaskConical,
  mocks: Timer,
  account: Settings,
  admin: Shield,
  home: Home,
  signIn: LogIn,
  signUp: UserPlus,
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

const tab = "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs no-underline";

/**
 * Phones and tablets: the main items in a bottom bar, and a More button that opens a sheet with the rest
 * (Saved, Labs, Mocks, Account, Admin), the theme and Sign out.
 */
export function BottomNav({ items, more, signedIn }: { items: NavItem[]; more: NavItem[]; signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = more.some((i) => isActive(pathname, i.href));
  const moreBadge = more.reduce((n, i) => n + (i.badge ?? 0), 0);
  return (
    <nav aria-label={`${en.nav.main} (mobile)`} className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length + (more.length || signedIn ? 1 : 0)}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = ICONS[item.key];
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(tab, active ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground")}
              >
                <span className="relative">
                  <Icon aria-hidden="true" className="size-5" />
                  {item.badge ? (
                    <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                      {item.badge > 99 ? "99+" : item.badge}
                      <span className="sr-only"> due</span>
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
        {more.length || signedIn ? (
          <li>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger className={cn(tab, moreActive ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground")}>
                <span className="relative">
                  <Menu aria-hidden="true" className="size-5" />
                  {moreBadge ? <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-primary" aria-hidden="true" /> : null}
                </span>
                {en.nav.more}
              </DialogTrigger>
              <DialogContent className="inset-x-0 bottom-0 left-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5 sm:left-1/2 sm:max-w-md sm:-translate-x-1/2">
                <div className="mb-3 flex items-center justify-between">
                  <DialogTitle>{en.nav.more}</DialogTitle>
                  <DialogClose className="inline-flex size-10 items-center justify-center rounded-md hover:bg-muted" aria-label="Close menu">
                    <X aria-hidden="true" className="size-5" />
                  </DialogClose>
                </div>
                <DialogDescription className="sr-only">More pages, the theme and signing out.</DialogDescription>
                <ul className="flex flex-col gap-1">
                  {more.map((item) => {
                    const Icon = ICONS[item.key];
                    const active = isActive(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-12 items-center gap-3 rounded-md px-3 text-[15px] no-underline",
                            active ? "bg-primary-soft font-semibold text-primary" : "text-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon aria-hidden="true" className="size-5" />
                          <span className="flex-1">{item.label}</span>
                          {item.badge ? <span className="rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">{item.badge}</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 border-t pt-4">
                  <ThemeChoice />
                </div>
                {signedIn ? (
                  <form action={signOutAction} className="mt-4 border-t pt-3">
                    <button type="submit" className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-[15px] text-foreground hover:bg-muted">
                      <LogOut aria-hidden="true" className="size-5" />
                      {en.nav.signOut}
                    </button>
                  </form>
                ) : null}
              </DialogContent>
            </Dialog>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
