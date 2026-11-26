import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { OnboardingForm } from "@/components/forms/onboarding-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { getDb } from "@/db";
import { certStatus } from "@/db/schema";
import { PATH_GROUPS } from "@/lib/path";
import { todayIn } from "@/lib/dates";
import { en } from "@/messages/en";
import { getCatalog } from "@/server/catalog";
import { getProfile, requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const [catalog, profile, passedRows] = await Promise.all([
    getCatalog(),
    getProfile(user.id),
    getDb()
      .select({ cert: certStatus.certCode, on: certStatus.passedOn })
      .from(certStatus)
      .where(and(eq(certStatus.userId, user.id), eq(certStatus.state, "passed"))),
  ]);
  const groups = PATH_GROUPS.map((g) => ({
    name: g.name,
    certs: g.certs.flatMap((c) => {
      const cert = catalog.certs.get(c);
      return cert ? [{ code: cert.code, name: cert.name }] : [];
    }),
  }));
  const again = Boolean(profile?.onboardedAt);
  const initial = {
    goal: profile?.goal ?? "golden",
    goalCert: profile?.goalCert ?? "CKA",
    hours: profile?.hoursPerWeek ?? 4,
    passed: Object.fromEntries(passedRows.filter((r) => catalog.certs.has(r.cert)).map((r) => [r.cert, r.on ?? ""])),
  };
  return (
    <>
      <header className="flex items-center justify-between border-b bg-card px-4 py-3 sm:px-8">
        <span className="font-bold">{en.appName}</span>
        <div className="flex items-center gap-3">
          {again ? (
            <Link href="/today" className="text-sm">
              Cancel
            </Link>
          ) : null}
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[860px] px-4 py-10 sm:px-6">
        <h1 className="text-[30px] font-bold">{again ? "Change your goal" : `Welcome, ${user.name.split(" ")[0]}`}</h1>
        <p className="mb-8 mt-2 text-[15px] text-muted-foreground">
          {again
            ? "Update your answers and we pick a new focus cert. Your progress, answers and review queue stay."
            : "Three quick questions, then we pick a cert to focus on and show your first step. It takes about a minute."}
        </p>
        <OnboardingForm groups={groups} today={todayIn(profile?.timeZone ?? "UTC")} initial={initial} />
      </main>
    </>
  );
}
