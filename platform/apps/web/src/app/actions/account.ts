"use server";

import { eq } from "drizzle-orm";
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

  const focus = chooseFocus(goal.data, goalCert, new Set(passed.map((p) => p.cert)));
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const p of passed) {
      await tx
        .insert(certStatus)
        .values({ userId: user.id, certCode: p.cert, state: "passed", passedOn: p.date })
        .onConflictDoUpdate({ target: [certStatus.userId, certStatus.certCode], set: { state: "passed", passedOn: p.date, bookedFor: null, updatedAt: new Date() } });
    }
    const values = { timeZone, goal: goal.data, goalCert, hoursPerWeek: hours.data, focusCert: focus, onboardedAt: new Date(), updatedAt: new Date() };
    await tx.insert(profile).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: profile.userId, set: values });
  });
  revalidatePath("/", "layout");
  redirect("/today");
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
