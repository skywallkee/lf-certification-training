import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth";
import { todayIn } from "@/lib/dates";
import { en } from "@/messages/en";
import { getActiveSession } from "@/server/labs";
import { getReviewDue } from "@/server/progress";
import { getProfile, getUser } from "@/server/session";
import { ActiveSessionBanner } from "./labs/active-session-banner";
import { BottomNav, SidebarNav, type NavGroup, type NavItem } from "./nav-links";
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

  // Sidebar: grouped by what the learner wants to do, each item with a one-line hint. Search lives in the top bar only.
  const groups: NavGroup[] = user
    ? [
        { items: [{ key: "today", href: "/today", label: en.nav.today, hint: en.nav.hints.today }] },
        {
          label: en.nav.groups.learn,
          items: [
            { key: "certs", href: "/certs", label: en.nav.certs, short: en.nav.certsShort, hint: en.nav.hints.certs },
            { key: "review", href: "/review", label: en.nav.review, hint: en.nav.hints.review, badge: due },
            { key: "saved", href: "/saved", label: en.nav.bookmarks, hint: en.nav.hints.saved },
          ],
        },
        {
          label: en.nav.groups.practise,
          items: [
            { key: "labs", href: "/labs", label: en.nav.labs, hint: en.nav.hints.labs },
            { key: "mocks", href: "/mocks", label: en.nav.mocks, hint: en.nav.hints.mocks },
          ],
        },
        {
          label: en.nav.groups.track,
          items: [
            { key: "plan", href: "/plan", label: en.nav.plan, hint: en.nav.hints.plan },
            { key: "progress", href: "/progress", label: en.nav.progress, hint: en.nav.hints.progress },
          ],
        },
      ]
    : [{ items: [{ key: "certs", href: "/certs", label: en.nav.certs, hint: en.nav.hints.certsPublic }] }];
  const secondary: NavItem[] = user
    ? [
        { key: "account", href: "/account", label: en.nav.account },
        ...(user.role === "admin" ? [{ key: "admin" as const, href: "/admin", label: en.nav.admin }] : []),
      ]
    : [];
  const all = groups.flatMap((g) => g.items);
  // Phones: four tabs and a More sheet with the rest, grouped like the sidebar. Search is the header button.
  const mobileKeys = ["today", "certs", "review", "labs"];
  const mobile: NavItem[] = user
    ? mobileKeys.map((k) => all.find((i) => i.key === k)!)
    : [
        { key: "home", href: "/", label: en.nav.home },
        { key: "certs", href: "/certs", label: en.nav.certs, short: en.nav.certsShort },
        { key: "signIn", href: "/sign-in", label: en.nav.signIn },
        { key: "signUp", href: "/sign-up", label: en.nav.signUp },
      ];
  const more: NavGroup[] = user
    ? [
        ...groups.map((g) => ({ ...g, items: g.items.filter((i) => !mobileKeys.includes(i.key)) })).filter((g) => g.items.length > 0),
        { label: en.nav.groups.you, items: secondary },
      ]
    : [];

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2"
      >
        {en.nav.skip}
      </a>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r bg-card px-4 py-6 lg:flex">
        <Link href={user ? "/today" : "/"} className="px-3 text-lg font-bold text-foreground no-underline hover:text-foreground">
          {en.appName}
        </Link>
        <SidebarNav groups={groups} secondary={secondary} />
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
