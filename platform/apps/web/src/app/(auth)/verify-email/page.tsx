import type { Metadata } from "next";
import { resendVerificationAction } from "@/app/actions/auth";
import { DevMailNotice } from "@/components/dev-mail-notice";
import { Button } from "@/components/ui/button";
import { VERIFY_SUBJECT } from "@/lib/auth";
import { devMail } from "@/server/dev-mail";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string; sent?: string }> }) {
  const { email = "", sent } = await searchParams;
  const mail = await devMail(email, VERIFY_SUBJECT);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Check your email</h1>
      <p className="text-[15px]">
        We sent a verification link to <strong>{email || "your email address"}</strong>. Open it to finish signing up; it
        works for 1 hour.
      </p>
      {sent ? <p role="status" className="text-sm text-success">A new link is on its way.</p> : null}
      <DevMailNotice mail={mail} linkLabel="Verify this email" />
      <form action={resendVerificationAction}>
        <input type="hidden" name="email" value={email} />
        <Button type="submit" variant="outline">
          Send the link again
        </Button>
      </form>
    </div>
  );
}
