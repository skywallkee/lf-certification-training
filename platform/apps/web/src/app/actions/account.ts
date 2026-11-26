"use server";

import { APIError } from "better-auth/api";
import { and, eq, notInArray } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { getDb } from "@/db";
import { certStatus, profile, user as userTable } from "@/db/schema";
import { isIsoDate, todayIn } from "@/lib/dates";
import { getAuth } from "@/lib/auth";
import { chooseFocus } from "@/lib/path";
import { getCatalog } from "@/server/catalog";
import { requireUser } from "@/server/session";

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface OnboardingState {
  error?: string;
}

/** Onboarding: certs already held (with pass dates), goal and hours a week. Sets the focus cert and opens Today. */
export async function onboardingAction(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const user = await requireUser("/onboarding");
  const catalog = await getCatalog();
  const tzRaw = String(form.get("timeZone") ?? "UTC");
  const timeZone = validTimeZone(tzRaw) ? tzRaw : "UTC";
  const today = todayIn(timeZone);
  const held = form.getAll("held").map(String).filter((c) => catalog.certs.has(c));
  const passed: { cert: string; date: string }[] = [];
  for (const cert of held) {
    const date = String(form.get(`passed-${cert}`) ?? "");
    if (!isIsoDate(date)) return { error: `Enter the date you passed ${cert}, roughly is fine.` };
    if (date > today) return { error: `The pass date for ${cert} cannot be in the future.` };
    passed.push({ cert, date });
  }
  const goal = z.enum(["golden", "kubestronaut", "one"]).safeParse(form.get("goal"));
  if (!goal.success) return { error: "Choose a goal." };
  const goalCert = goal.data === "one" ? String(form.get("goalCert") ?? "") : null;
  if (goal.data === "one" && (!goalCert || !catalog.certs.has(goalCert))) return { error: "Choose the cert you are aiming for." };
  const hours = z.coerce.number().int().min(1).max(40).safeParse(form.get("hours"));
  if (!hours.success) return { error: "Choose how many hours a week you can study." };

  const db = getDb();
  const [existing] = await db.select({ onboardedAt: profile.onboardedAt }).from(profile).where(eq(profile.userId, user.id));
  const firstRun = !existing?.onboardedAt;
  const focus = chooseFocus(goal.data, goalCert, new Set(passed.map((p) => p.cert)));
  await db.transaction(async (tx) => {
    // The form lists every passed cert (pre-ticked when the learner runs it again), so an unticked one is removed.
    const keep = passed.map((p) => p.cert);
    await tx
      .delete(certStatus)
      .where(and(eq(certStatus.userId, user.id), eq(certStatus.state, "passed"), keep.length ? notInArray(certStatus.certCode, keep) : undefined));
    for (const p of passed) {
      await tx
        .insert(certStatus)
        .values({ userId: user.id, certCode: p.cert, state: "passed", passedOn: p.date })
        .onConflictDoUpdate({ target: [certStatus.userId, certStatus.certCode], set: { state: "passed", passedOn: p.date, bookedFor: null, updatedAt: new Date() } });
    }
    const values = {
      timeZone,
      goal: goal.data,
      goalCert,
      hoursPerWeek: hours.data,
      focusCert: focus,
      onboardedAt: existing?.onboardedAt ?? new Date(),
      updatedAt: new Date(),
    };
    await tx.insert(profile).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: profile.userId, set: values });
  });
  revalidatePath("/", "layout");
  // The first time, Today shows a short welcome that explains where things are.
  redirect(firstRun ? "/today?welcome=1" : "/today");
}

export interface ProfileState {
  error?: string;
  ok?: boolean;
}

export async function updateProfileAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser("/account");
  const name = String(form.get("name") ?? "").trim();
  const timeZone = String(form.get("timeZone") ?? "");
  if (name.length === 0 || name.length > 80) return { error: "Enter a display name of up to 80 characters." };
  if (!validTimeZone(timeZone)) return { error: "Choose a valid time zone." };
  const hours = z.coerce.number().int().min(1).max(40).safeParse(form.get("hours"));
  const db = getDb();
  await db.update(userTable).set({ name }).where(eq(userTable.id, user.id));
  const values = { timeZone, ...(hours.success ? { hoursPerWeek: hours.data } : {}), updatedAt: new Date() };
  await db.insert(profile).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: profile.userId, set: values });
  revalidatePath("/", "layout");
  return { ok: true };
}

export interface PasswordState {
  error?: string;
}

const ChangePassword = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    password: z.string().min(10, "Use at least 10 characters for the new password.").max(128, "Use at most 128 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The two new passwords do not match." });

/** Changes the password and signs out every other device; this one stays signed in. */
export async function changePasswordAction(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  await requireUser("/account");
  const parsed = ChangePassword.safeParse({ current: form.get("current"), password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  try {
    await getAuth().api.changePassword({
      body: { currentPassword: parsed.data.current, newPassword: parsed.data.password, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (err) {
    if (err instanceof APIError) {
      if (/invalid password|incorrect/i.test(err.message)) return { error: "Your current password is not right." };
      return { error: err.message || "Could not change the password." };
    }
    throw err;
  }
  // A redirect, not a returned state: the new session cookie refreshes the page, which would drop that state.
  redirect("/account?password=changed#password");
}

/**
 * Deletes the account and every learner row (they cascade from the user), then signs out. Flags the learner
 * filed stay in the admin queue without a name.
 */
export async function deleteAccountAction(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const user = await requireUser("/account");
  if (String(form.get("confirm") ?? "").trim() !== "DELETE") return { error: "Type DELETE to confirm." };
  await getAuth().api.signOut({ headers: await headers() }).catch(() => undefined);
  await getDb().delete(userTable).where(eq(userTable.id, user.id));
  redirect("/?deleted=1");
}
