"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { getDb } from "@/db";
import { certStatus, profile, studyTarget } from "@/db/schema";
import { isIsoDate } from "@/lib/dates";
import { getCatalog } from "@/server/catalog";
import { sendPlanNow } from "@/server/reminders";
import { getProfile, requireUser } from "@/server/session";
import { learnerToday } from "@/server/today";
import { unsubscribe, unsubscribeKind, verifyUnsubscribe } from "@/server/unsubscribe";

const CertCode = z.string().regex(/^[A-Z]{2,6}$/);

export interface PlanFormState {
  error?: string;
  ok?: string;
}

/**
 * Sets the exam date a plan counts down to. "Booked" records the exam as booked on the path (cert_status), so the
 * Path and Progress pages show it too; otherwise it is a target date, kept apart (study_target). Clearing removes
 * the target, or the booking.
 */
export async function setExamDateAction(_prev: PlanFormState, form: FormData): Promise<PlanFormState> {
  const user = await requireUser("/plan");
  const parsed = CertCode.safeParse(form.get("cert"));
  const catalog = await getCatalog();
  if (!parsed.success || !catalog.certs.has(parsed.data)) return { error: "Unknown cert." };
  const code = parsed.data;
  const db = getDb();
  const mine = (t: typeof studyTarget | typeof certStatus) => and(eq(t.userId, user.id), eq(t.certCode, code));
  if (form.get("intent") === "clear") {
    await db.delete(studyTarget).where(mine(studyTarget));
    await db.delete(certStatus).where(and(mine(certStatus), eq(certStatus.state, "booked")));
    revalidatePath("/", "layout");
    return { ok: `${code} exam date removed.` };
  }
  const date = String(form.get("date") ?? "");
  if (!isIsoDate(date)) return { error: "Enter the exam date." };
  const today = learnerToday(await getProfile(user.id));
  if (date < today) return { error: "Pick a date from today on." };
  if (date > `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`) return { error: "Pick a date within the next two years." };
  const booked = form.get("booked") === "on";
  await db.transaction(async (tx) => {
    if (booked) {
      await tx.delete(studyTarget).where(mine(studyTarget));
      await tx
        .insert(certStatus)
        .values({ userId: user.id, certCode: code, state: "booked", bookedFor: date })
        .onConflictDoUpdate({ target: [certStatus.userId, certStatus.certCode], set: { state: "booked", bookedFor: date, passedOn: null, updatedAt: new Date() } });
    } else {
      // Unticking "booked" turns a booking back into a target date.
      await tx.delete(certStatus).where(and(mine(certStatus), eq(certStatus.state, "booked")));
      await tx
        .insert(studyTarget)
        .values({ userId: user.id, certCode: code, examOn: date })
        .onConflictDoUpdate({ target: [studyTarget.userId, studyTarget.certCode], set: { examOn: date, updatedAt: new Date() } });
    }
  });
  revalidatePath("/", "layout");
  return { ok: booked ? `${code} exam booked. Your plan is updated.` : `${code} target date saved. Your plan is updated.` };
}

export interface RemindersState {
  error?: string;
  ok?: boolean;
}

export async function updateRemindersAction(_prev: RemindersState, form: FormData): Promise<RemindersState> {
  const user = await requireUser("/account");
  const day = z.coerce.number().int().min(0).max(6).safeParse(form.get("day"));
  const hour = z.coerce.number().int().min(0).max(23).safeParse(form.get("hour"));
  if (!day.success || !hour.success) return { error: "Choose a day and a time." };
  const values = {
    remindWeekly: form.get("weekly") === "on",
    remindNudge: form.get("nudge") === "on",
    remindExam: form.get("exam") === "on",
    remindDay: day.data,
    remindHour: hour.data,
    updatedAt: new Date(),
  };
  await getDb().insert(profile).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: profile.userId, set: values });
  revalidatePath("/account");
  revalidatePath("/plan");
  return { ok: true };
}

/** "Email me this week's plan": sends it now so the learner can see what the weekly email looks like. */
export async function sendPlanNowAction(_prev: PlanFormState, _form: FormData): Promise<PlanFormState> {
  const user = await requireUser("/plan");
  const p = await getProfile(user.id);
  const sent = await sendPlanNow({
    id: user.id,
    name: user.name,
    email: user.email,
    timeZone: p?.timeZone ?? "UTC",
    hoursPerWeek: p?.hoursPerWeek ?? null,
    focusCert: p?.focusCert ?? null,
  });
  return sent ? { ok: `Sent to ${user.email}.` } : { error: "Set an exam date first; the email is built from your plan." };
}

/** The unsubscribe page's button. Works signed out; the signed link proves whose reminders to stop. */
export async function unsubscribeAction(form: FormData): Promise<void> {
  const u = String(form.get("u") ?? "");
  const t = String(form.get("t") ?? "");
  const kind = unsubscribeKind(String(form.get("k") ?? ""));
  const k = kind === "discussions" ? "&k=discussions" : "";
  const userId = verifyUnsubscribe(u, t, kind);
  if (!userId) redirect(`/unsubscribe?invalid=1${k}`);
  await unsubscribe(userId, kind);
  redirect(`/unsubscribe?done=1${k}`);
}
