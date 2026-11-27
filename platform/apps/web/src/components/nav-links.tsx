"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookMarked, CalendarCheck, CalendarRange, FlaskConical, GraduationCap, Home, LogIn, LogOut, Menu, RotateCcw, Settings, Shield, Timer, TrendingUp, UserPlus, X } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";
import { ThemeChoice } from "./theme-toggle";

const ICONS = {
  today: CalendarCheck,
  plan: CalendarRange,
  progress: TrendingUp,
  certs: GraduationCap,
  review: RotateCcw,
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
  /** One short line under the label in the sidebar, so it is clear what the page is for. */
  hint?: string;
  /** A shorter label for the phone bottom bar, where space is tight. */
  short?: string;
  badge?: number;
}

export interface NavGroup {
  /** Shown as a small heading above the group; the first group (Today) has none. */
  label?: string;
  items: NavItem[];
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ groups, secondary }: { groups: NavGroup[]; secondary: NavItem[] }) {
  const pathname = usePathname();
  const render = (item: NavItem) => {
    const Icon = ICONS[item.key];
    const active = isActive(pathname, item.href);
    return (
      <li key={item.key}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-start gap-3 rounded-md px-3 py-2 text-sm no-underline",
            active ? "bg-primary-soft text-primary" : "text-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={active ? "font-semibold" : "font-medium"}>{item.label}</span>
            {item.hint ? <span className={cn("text-xs leading-snug", active ? "text-primary" : "text-muted-foreground")}>{item.hint}</span> : null}
          </span>
          {item.badge ? (
            <span className="mt-0.5 rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">
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
      <div className="flex flex-col gap-4">
        {groups.map((g, i) => (
          <div key={g.label ?? i} className="flex flex-col gap-1">
            {g.label ? (
              <h2 id={`nav-${g.label}`} className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </h2>
            ) : null}
            <ul aria-labelledby={g.label ? `nav-${g.label}` : undefined} className="flex flex-col gap-0.5">
              {g.items.map(render)}
            </ul>
          </div>
        ))}
      </div>
      <ul className="flex flex-col gap-0.5">{secondary.map(render)}</ul>
    </nav>
  );
}

const tab = "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs no-underline";

/**
 * Phones and tablets: the main items in a bottom bar, and a More button that opens a sheet with the rest
 * (grouped like the sidebar, with the same hints), the theme and Sign out.
 */
export function BottomNav({ items, more: groups, signedIn }: { items: NavItem[]; more: NavGroup[]; signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const more = groups.flatMap((g) => g.items);
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
                {item.short ?? item.label}
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
                <div className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto">
                  {groups.map((g, gi) => (
                    <div key={g.label ?? gi} className="flex flex-col gap-1">
                      {g.label ? <h3 className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</h3> : null}
                      <ul className="flex flex-col gap-0.5">
                        {g.items.map((item) => {
                          const Icon = ICONS[item.key];
                          const active = isActive(pathname, item.href);
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                onClick={() => setOpen(false)}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                  "flex min-h-12 items-center gap-3 rounded-md px-3 py-1.5 text-[15px] no-underline",
                                  active ? "bg-primary-soft font-semibold text-primary" : "text-foreground hover:bg-muted hover:text-foreground",
                                )}
                              >
                                <Icon aria-hidden="true" className="size-5 shrink-0" />
                                <span className="flex min-w-0 flex-1 flex-col">
                                  <span>{item.label}</span>
                                  {item.hint ? <span className="text-xs font-normal text-muted-foreground">{item.hint}</span> : null}
                                </span>
                                {item.badge ? <span className="rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">{item.badge}</span> : null}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
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
