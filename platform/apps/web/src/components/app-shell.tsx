import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth";
import { todayIn } from "@/lib/dates";
import { en } from "@/messages/en";
import { getActiveSession } from "@/server/labs";
import { getReviewDue } from "@/server/progress";
import { getProfile, getUser } from "@/server/session";
import { ActiveSessionBanner } from "./labs/active-session-banner";
import { BottomNav, SidebarNav, type NavItem } from "./nav-links";
import { QuickSearch } from "./quick-search";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./ui/button";

/** Page shell: sidebar on large screens, top bar with focus cert and account, bottom bar on phones. */
export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getUser();
  const profile = user ? await getProfile(user.id) : null;
  const today = todayIn(profile?.timeZone ?? "UTC");
  const [due, active] = user ? await Promise.all([getReviewDue(user.id, today).then((r) => r.count), getActiveSession(user.id)]) : [0, null];

  const items: NavItem[] = user
    ? [
        { key: "today", href: "/today", label: en.nav.today },
        { key: "path", href: "/path", label: en.nav.path },
        { key: "certs", href: "/certs", label: en.nav.certs },
        { key: "review", href: "/review", label: en.nav.review, badge: due },
        { key: "search", href: "/search", label: en.nav.search },
        { key: "saved", href: "/saved", label: en.nav.bookmarks },
        { key: "labs", href: "/labs", label: en.nav.labs },
        { key: "mocks", href: "/mocks", label: en.nav.mocks },
      ]
    : [
        { key: "certs", href: "/certs", label: en.nav.certs },
        { key: "search", href: "/search", label: en.nav.search },
      ];
  const secondary: NavItem[] = user
    ? [
        { key: "account", href: "/account", label: en.nav.account },
        ...(user.role === "admin" ? [{ key: "admin" as const, href: "/admin", label: en.nav.admin }] : []),
      ]
    : [];
  // Phones: four tabs and a More sheet with the rest. Search is the header button.
  const mobile: NavItem[] = user
    ? items.filter((i) => ["today", "path", "certs", "review"].includes(i.key))
    : [
        { key: "home", href: "/", label: en.nav.home },
        { key: "certs", href: "/certs", label: en.nav.certs },
        { key: "signIn", href: "/sign-in", label: en.nav.signIn },
        { key: "signUp", href: "/sign-up", label: en.nav.signUp },
      ];
  const more: NavItem[] = user ? [...items.filter((i) => !mobile.includes(i)), ...secondary] : [{ key: "search", href: "/search", label: en.nav.search }];

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2"
      >
        {en.nav.skip}
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-card px-4 py-6 lg:flex">
        <Link href={user ? "/today" : "/"} className="px-3 text-lg font-bold text-foreground no-underline hover:text-foreground">
          {en.appName}
        </Link>
        <SidebarNav items={items} secondary={secondary} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-1 border-b bg-card/95 px-4 backdrop-blur sm:gap-2 sm:px-6">
          <Link href={user ? "/today" : "/"} className="mr-auto truncate font-bold text-foreground no-underline hover:text-foreground lg:hidden">
            {en.appName}
          </Link>
          <QuickSearch className="lg:mr-auto" />
          <div className="flex shrink-0 items-center gap-1">
            {profile?.focusCert ? (
              <Link
                href={`/certs/${profile.focusCert.toLowerCase()}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hidden sm:inline-flex")}
              >
                Focus: {profile.focusCert}
              </Link>
            ) : null}
            <ThemeToggle />
            {user ? (
              <form action={signOutAction} className="hidden lg:block">
                <button type="submit" className="min-h-10 rounded-md px-3 text-sm text-foreground hover:bg-muted">
                  {en.nav.signOut}
                </button>
              </form>
            ) : (
              <Link href="/sign-in" className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}>
                {en.nav.signIn}
              </Link>
            )}
          </div>
        </header>
        {active ? <ActiveSessionBanner session={active} /> : null}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-6 sm:px-8 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>
      <BottomNav items={mobile} more={more} signedIn={Boolean(user)} />
    </div>
  );
}
