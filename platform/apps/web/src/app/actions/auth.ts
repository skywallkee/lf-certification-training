"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as z from "zod";
import { getAuth } from "@/lib/auth";

export interface FormState {
  error?: string;
  fields?: Record<string, string>;
}

/** Only same-site relative paths, so `next` cannot send a learner to another site after sign-in. */
function safeNext(value: FormDataEntryValue | null, fallback: string): string {
  const s = typeof value === "string" ? value : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}

const SignIn = z.object({ email: z.email(), password: z.string().min(1) });

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = SignIn.safeParse({ email: form.get("email"), password: form.get("password") });
  const email = String(form.get("email") ?? "");
  if (!parsed.success) return { error: "Enter your email and password.", fields: { email } };
  const next = safeNext(form.get("next"), "/today");
  try {
    await getAuth().api.signInEmail({ body: { ...parsed.data, callbackURL: next }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === "FORBIDDEN" && /verif/i.test(err.message)) {
        redirect(`/verify-email?email=${encodeURIComponent(email)}`);
      }
      if (/banned/i.test(err.message)) return { error: "This account is disabled. Contact the site admin.", fields: { email } };
      return { error: "That email and password do not match an account.", fields: { email } };
    }
    throw err;
  }
  redirect(next);
}

const SignUp = z.object({
  name: z.string().trim().min(1, "Enter a display name.").max(80),
  email: z.email("Enter a valid email address."),
  password: z.string().min(10, "Use at least 10 characters for your password.").max(128),
});

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  const raw = { name: form.get("name"), email: form.get("email"), password: form.get("password") };
  const fields = { name: String(raw.name ?? ""), email: String(raw.email ?? "") };
  const parsed = SignUp.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form.", fields };
  try {
    await getAuth().api.signUpEmail({ body: { ...parsed.data, callbackURL: "/onboarding" }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) {
      if (/exist/i.test(err.message)) return { error: "An account with this email already exists. Sign in instead.", fields };
      return { error: err.message || "Could not create the account.", fields };
    }
    throw err;
  }
  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function signInGithubAction(form: FormData): Promise<void> {
  const next = safeNext(form.get("next"), "/today");
  const res = await getAuth().api.signInSocial({
    body: { provider: "github", callbackURL: next, newUserCallbackURL: "/onboarding" },
    headers: await headers(),
  });
  if (res.url) redirect(res.url);
  redirect("/sign-in");
}

export async function resendVerificationAction(form: FormData): Promise<void> {
  const email = String(form.get("email") ?? "");
  if (z.email().safeParse(email).success) {
    await getAuth()
      .api.sendVerificationEmail({ body: { email, callbackURL: "/onboarding" }, headers: await headers() })
      .catch(() => undefined);
  }
  redirect(`/verify-email?email=${encodeURIComponent(email)}&sent=1`);
}

export async function signOutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/");
}
