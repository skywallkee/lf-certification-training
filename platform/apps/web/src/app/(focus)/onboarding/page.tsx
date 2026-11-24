import type { Metadata } from "next";
import { OnboardingForm } from "@/components/forms/onboarding-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { PATH_GROUPS } from "@/lib/path";
import { todayIn } from "@/lib/dates";
import { en } from "@/messages/en";
import { getCatalog } from "@/server/catalog";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const catalog = await getCatalog();
  const groups = PATH_GROUPS.map((g) => ({
    name: g.name,
    certs: g.certs.flatMap((c) => {
      const cert = catalog.certs.get(c);
      return cert ? [{ code: cert.code, name: cert.name }] : [];
    }),
  }));
  return (
    <>
      <header className="flex items-center justify-between border-b bg-card px-4 py-3 sm:px-8">
        <span className="font-bold">{en.appName}</span>
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto w-full max-w-[860px] px-4 py-10 sm:px-6">
        <h1 className="text-[30px] font-bold">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="mb-8 mt-2 text-[15px] text-muted-foreground">Three questions, then we pick a cert to focus on and show your first step.</p>
        <OnboardingForm groups={groups} today={todayIn("UTC")} />
      </main>
    </>
  );
}
