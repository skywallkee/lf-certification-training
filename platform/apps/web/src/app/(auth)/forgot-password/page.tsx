import type { Metadata } from "next";
import { DevMailNotice } from "@/components/dev-mail-notice";
import { ForgotPasswordForm } from "@/components/forms/auth-forms";
import { RESET_SUBJECT } from "@/lib/auth";
import { devMail } from "@/server/dev-mail";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string; sent?: string }> }) {
  const { email = "", sent } = await searchParams;
  if (sent) {
    const mail = await devMail(email, RESET_SUBJECT);
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="text-[15px]">
          If <strong>{email || "that email"}</strong> has an account, a link to choose a new password is on its way. It
          works for 1 hour.
        </p>
        <DevMailNotice mail={mail} linkLabel="Choose a new password" />
        <p className="text-sm text-muted-foreground">
          No email after a few minutes? Check spam, or <a href={`/forgot-password?email=${encodeURIComponent(email)}`}>try again</a>.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">Enter the email you signed up with and we will send you a link to choose a new password.</p>
      </div>
      <ForgotPasswordForm email={email} />
    </div>
  );
}
