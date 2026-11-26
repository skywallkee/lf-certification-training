import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

/** The emailed link goes through Better Auth, which checks the token and lands here with ?token= or ?error=. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  if (!token || error) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold">This link no longer works</h1>
        <p className="text-[15px]">Reset links work once, for 1 hour. Ask for a new one and use the latest email.</p>
        <p>
          <Link href="/forgot-password">Send a new reset link</Link>
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">You will be signed out everywhere and can sign in with the new password.</p>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  );
}
