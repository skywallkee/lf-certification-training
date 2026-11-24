import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { resendVerificationAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { outboxEmail } from "@/db/schema";
import { env } from "@/env";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string; sent?: string }> }) {
  const { email = "", sent } = await searchParams;
  // Development only: Phase 1 has no mail provider, so show the link that would have been emailed.
  const devLink = env.showDevEmails && email
    ? (await getDb().select().from(outboxEmail).where(eq(outboxEmail.to, email)).orderBy(desc(outboxEmail.id)).limit(1))[0]?.text.match(/https?:\/\/\S+/)?.[0]
    : undefined;
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Check your email</h1>
      <p className="text-[15px]">
        We sent a verification link to <strong>{email || "your email address"}</strong>. Open it to finish signing up; it
        works for 1 hour.
      </p>
      {sent ? <p role="status" className="text-sm text-success">A new link is on its way.</p> : null}
      {devLink ? (
        <div className="rounded-md border border-warning bg-warning-soft p-3 text-sm">
          <p className="font-semibold">Development mode</p>
          <p className="mt-1">
            No mail provider is set up, so here is the link: <a href={devLink}>Verify this email</a>
          </p>
        </div>
      ) : null}
      <form action={resendVerificationAction}>
        <input type="hidden" name="email" value={email} />
        <Button type="submit" variant="outline">
          Send the link again
        </Button>
      </form>
    </div>
  );
}
