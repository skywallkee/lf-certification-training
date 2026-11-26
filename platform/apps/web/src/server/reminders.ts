import "server-only";
import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { profile, reminderSent, user as userTable } from "@/db/schema";
import { env } from "@/env";
import { dateIn, formatLong, todayIn, type IsoDate } from "@/lib/dates";
import { dueReminders, type DueReminder } from "@/lib/reminders";
import { formatMinutes, weekStart, type PlanWeek } from "@/lib/study-plan";
import { getCatalog, type Catalog } from "./catalog";
import { sendEmail } from "./email";
import { getPlans, getStudyActivity, type CertPlan, type StudyActivity } from "./plan";
import { getReviewDue } from "./progress";
import { oneClickUrl, unsubscribeUrl } from "./unsubscribe";

/**
 * Study reminder emails (weekly plan, nudge, exam countdown). The scheduler in instrumentation.ts calls
 * runReminders every few minutes; lib/reminders.ts decides what is due, and a row in reminder_sent is written
 * before each send, so a reminder goes out once even if two app instances run the check.
 */

interface Learner {
  id: string;
  name: string;
  email: string;
  timeZone: string;
  hoursPerWeek: number | null;
  focusCert: string | null;
}

const url = (path: string) => `${env.baseUrl}${path}`;

function firstName(name: string): string {
  return name.split(/[\s(]/)[0] || "there";
}

function footer(userId: string): string {
  return [
    "",
    "--",
    "You get this email because you turned on study reminders in LF Cert Trainer.",
    `Change which reminders you get: ${url("/account#reminders")}`,
    `Stop all study reminders: ${unsubscribeUrl(userId)}`,
  ].join("\n");
}

function headers(userId: string): Record<string, string> {
  return { "List-Unsubscribe": `<${oneClickUrl(userId)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

function weekLines(week: PlanWeek): string[] {
  return week.tasks
    .filter((t) => t.kind !== "exam")
    .map((t) => `- ${t.label}${t.minutes > 0 ? ` (${formatMinutes(t.minutes)})` : ""}${t.href ? `: ${url(t.href)}` : ""}`);
}

function planBlock(p: CertPlan): string[] {
  if (!p.plan || !p.date) return [];
  const week = p.plan.weeks[0];
  const lines = [
    `${p.cert.code} exam on ${formatLong(p.date.examOn)} (${p.date.booked ? "booked" : "target date"}), ${p.plan.daysLeft} day${p.plan.daysLeft === 1 ? "" : "s"} left`,
    p.plan.paceNote,
  ];
  if (week) {
    lines.push("", `This week${week.minutes > 0 ? `, about ${formatMinutes(week.minutes)}` : ""}:`, ...weekLines(week));
  }
  return lines;
}

export function weeklyEmail(learner: Learner, plans: CertPlan[], activity: StudyActivity, weekOf: IsoDate) {
  const dated = plans.filter((p) => p.plan && p.plan.daysLeft >= 0);
  const body = [
    `Hi ${firstName(learner.name)},`,
    "",
    "Here is your study plan for this week.",
    ...dated.flatMap((p) => ["", ...planBlock(p)]),
    "",
    activity.lastWeekMinutes > 0 ? `Last week you studied about ${formatMinutes(activity.lastWeekMinutes)}.` : "No study recorded last week. A short session today gets you going again.",
    "",
    `Open your plan: ${url("/plan")}`,
    footer(learner.id),
  ];
  return {
    to: learner.email,
    subject: `Your study plan for the week of ${formatLong(weekOf).replace(/ \d{4}$/, "")}`,
    text: body.join("\n"),
    headers: headers(learner.id),
  };
}

export function nudgeEmail(learner: Learner, idleDays: number, plans: CertPlan[], reviewDue: number) {
  const next = plans.find((p) => p.plan)?.plan?.weeks[0]?.tasks.find((t) => t.kind === "study" || t.kind === "quiz");
  const step =
    reviewDue > 0
      ? `${reviewDue} missed question${reviewDue === 1 ? " is" : "s are"} due for review, about ${Math.max(5, Math.round(reviewDue * 1.5))} minutes: ${url("/review")}`
      : next
        ? `${next.label}: ${url(next.href ?? "/today")}`
        : `Your next step is waiting on Today: ${url("/today")}`;
  const soonest = plans.find((p) => p.plan && p.plan.daysLeft >= 0);
  const body = [
    `Hi ${firstName(learner.name)},`,
    "",
    `It has been ${idleDays} days since your last study session. Fifteen minutes today keeps what you learned fresh.`,
    "",
    "A good place to start:",
    `- ${step}`,
    ...(soonest?.date && soonest.plan ? ["", `${soonest.cert.code} exam: ${formatLong(soonest.date.examOn)}, ${soonest.plan.daysLeft} days left.`] : []),
    footer(learner.id),
  ];
  return { to: learner.email, subject: "Pick up where you left off", text: body.join("\n"), headers: headers(learner.id) };
}

export function examEmail(learner: Learner, r: Extract<DueReminder, { kind: "exam" }>, plan: CertPlan | undefined) {
  const tomorrow = r.daysLeft === 1;
  const lines = tomorrow
    ? [
        `Your ${r.cert} exam is tomorrow, ${formatLong(r.examOn)}.`,
        "",
        "- Rest tonight. Cramming now helps less than sleep.",
        "- Check your ID, your room and the exam check-in steps from the exam provider.",
        `- If you want a last warm-up, clear your review queue: ${url("/review")}`,
        "",
        "Good luck.",
      ]
    : [
        `Your ${r.cert} exam is in one week, on ${formatLong(r.examOn)}.`,
        ...(plan?.plan ? ["", plan.plan.paceNote] : []),
        "",
        "For this last week:",
        ...(plan?.plan?.weeks[0] ? weekLines(plan.plan.weeks[0]) : [`- Review and light practice: ${url("/review")}`]),
        "",
        `Readiness by domain: ${url(`/certs/${r.cert.toLowerCase()}/readiness`)}`,
      ];
  return {
    to: learner.email,
    subject: tomorrow ? `${r.cert} exam tomorrow` : `${r.cert} exam in one week`,
    text: [`Hi ${firstName(learner.name)},`, "", ...lines, footer(learner.id)].join("\n"),
    headers: headers(learner.id),
  };
}

async function compose(learner: Learner, r: DueReminder, catalog: Catalog, today: IsoDate) {
  const plans = await getPlans(learner.id, catalog, { today, hoursPerWeek: learner.hoursPerWeek, focusCert: learner.focusCert });
  if (r.kind === "weekly") return weeklyEmail(learner, plans, await getStudyActivity(learner.id, catalog, learner.timeZone, today), r.weekOf);
  if (r.kind === "nudge") return nudgeEmail(learner, r.idleDays, plans, (await getReviewDue(learner.id, today)).count);
  return examEmail(learner, r, plans.find((p) => p.cert.code === r.cert));
}

/** Checks every learner with a reminder turned on and sends what is due. Returns how many emails went out. */
export async function runReminders(now = new Date()): Promise<{ checked: number; sent: number }> {
  const db = getDb();
  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      timeZone: profile.timeZone,
      hoursPerWeek: profile.hoursPerWeek,
      focusCert: profile.focusCert,
      onboardedAt: profile.onboardedAt,
      weekly: profile.remindWeekly,
      nudge: profile.remindNudge,
      exam: profile.remindExam,
      day: profile.remindDay,
      hour: profile.remindHour,
    })
    .from(profile)
    .innerJoin(userTable, eq(userTable.id, profile.userId))
    .where(and(eq(userTable.emailVerified, true), or(eq(profile.remindWeekly, true), eq(profile.remindNudge, true), eq(profile.remindExam, true))));
  if (rows.length === 0) return { checked: 0, sent: 0 };
  const catalog = await getCatalog();
  let sent = 0;
  for (const row of rows) {
    if (!row.onboardedAt) continue;
    try {
      const today = todayIn(row.timeZone, now);
      const [plans, activity] = await Promise.all([
        getPlans(row.id, catalog, { today, hoursPerWeek: row.hoursPerWeek, focusCert: row.focusCert }),
        row.nudge ? getStudyActivity(row.id, catalog, row.timeZone, today) : Promise.resolve(null),
      ]);
      const due = dueReminders({
        now,
        timeZone: row.timeZone,
        prefs: { weekly: row.weekly, nudge: row.nudge, exam: row.exam, day: row.day, hour: row.hour },
        lastStudyDay: activity?.lastStudyDay ?? null,
        onboardedDay: dateIn(row.timeZone, row.onboardedAt),
        exams: plans.filter((p) => p.date).map((p) => ({ cert: p.cert.code, examOn: p.date!.examOn })),
      });
      for (const r of due) {
        const claimed = await db.insert(reminderSent).values({ userId: row.id, key: r.key }).onConflictDoNothing().returning({ key: reminderSent.key });
        if (claimed.length === 0) continue;
        await sendEmail(await compose(row, r, catalog, today));
        sent += 1;
      }
    } catch (error) {
      console.error(`[reminders] failed for user ${row.id}:`, error);
    }
  }
  if (sent > 0) console.info(`[reminders] sent ${sent} reminder email(s) to ${rows.length} learner(s) checked`);
  return { checked: rows.length, sent };
}

/** "Email me this week's plan" on the plan page: sends now, whatever the reminder settings, and records nothing. */
export async function sendPlanNow(learner: Learner): Promise<boolean> {
  const catalog = await getCatalog();
  const today = todayIn(learner.timeZone);
  const plans = await getPlans(learner.id, catalog, { today, hoursPerWeek: learner.hoursPerWeek, focusCert: learner.focusCert });
  if (!plans.some((p) => p.plan && p.plan.daysLeft >= 0)) return false;
  const activity = await getStudyActivity(learner.id, catalog, learner.timeZone, today);
  await sendEmail(weeklyEmail(learner, plans, activity, weekStart(today)));
  return true;
}
