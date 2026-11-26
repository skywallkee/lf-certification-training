"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as z from "zod";
import { getAuth } from "@/lib/auth";
import { clear, clientIp, EMAIL_SENDS, EMAIL_SENDS_PER_IP, hit, isBlocked, PASSWORD_ATTEMPTS, PASSWORD_ATTEMPTS_PER_IP } from "@/server/rate-limit";

const TOO_MANY = "Too many attempts. Wait 15 minutes and try again, or reset your password.";

/** Counts one email this client asks the app to send to `email`; false once either limit is used up. */
async function allowEmailSend(kind: string, email: string): Promise<boolean> {
  const ip = await clientIp();
  const byEmail = hit(`${kind}:email:${email.toLowerCase()}`, EMAIL_SENDS);
  const byIp = hit(`${kind}:ip:${ip}`, EMAIL_SENDS_PER_IP);
  return byEmail && byIp;
}

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
  // Only failed attempts count, so a learner who signs in often is never locked out.
  const emailKey = `signin:email:${parsed.data.email.toLowerCase()}`;
  const ipKey = `signin:ip:${await clientIp()}`;
  if (isBlocked(emailKey, PASSWORD_ATTEMPTS) || isBlocked(ipKey, PASSWORD_ATTEMPTS_PER_IP)) return { error: TOO_MANY, fields: { email } };
  try {
    await getAuth().api.signInEmail({ body: { ...parsed.data, callbackURL: next }, headers: await headers() });
    clear(emailKey);
  } catch (err) {
    if (err instanceof APIError) {
      hit(emailKey, PASSWORD_ATTEMPTS);
      hit(ipKey, PASSWORD_ATTEMPTS_PER_IP);
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
  if (!(await allowEmailSend("signup", parsed.data.email))) return { error: "Too many sign-up attempts. Wait an hour and try again.", fields };
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
  if (z.email().safeParse(email).success && (await allowEmailSend("verify", email))) {
    await getAuth()
      .api.sendVerificationEmail({ body: { email, callbackURL: "/onboarding" }, headers: await headers() })
      .catch(() => undefined);
  }
  redirect(`/verify-email?email=${encodeURIComponent(email)}&sent=1`);
}

const ForgotPassword = z.object({ email: z.email() });

/**
 * Sends a reset link when the email has an account. The answer is the same either way, so the form cannot be
 * used to find out who has an account.
 */
export async function requestPasswordResetAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  if (!ForgotPassword.safeParse({ email }).success) return { error: "Enter the email you signed up with.", fields: { email } };
  // Over the limit, nothing is sent but the answer stays the same, so it reveals nothing about the account.
  if (await allowEmailSend("reset", email)) {
    await getAuth()
      .api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" }, headers: await headers() })
      .catch((err: unknown) => console.error("[auth] password reset request failed", err));
  }
  redirect(`/forgot-password?sent=1&email=${encodeURIComponent(email)}`);
}

const ResetPassword = z
  .object({
    token: z.string().min(1, "This reset link is incomplete. Ask for a new one."),
    password: z.string().min(10, "Use at least 10 characters for your password.").max(128, "Use at most 128 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The two passwords do not match." });

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = ResetPassword.safeParse({ token: form.get("token"), password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  try {
    await getAuth().api.resetPassword({ body: { token: parsed.data.token, newPassword: parsed.data.password }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) {
      if (/token/i.test(err.message)) return { error: "This reset link has expired or was already used. Ask for a new one." };
      return { error: err.message || "Could not change the password." };
    }
    throw err;
  }
  redirect("/sign-in?reset=1");
}

export async function signOutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/");
}
