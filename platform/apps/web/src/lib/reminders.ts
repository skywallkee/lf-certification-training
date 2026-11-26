import { daysBetween, todayIn, type IsoDate } from "./dates.ts";
import { weekStart } from "./study-plan.ts";

/**
 * Which study reminder emails are due for one learner right now. All three kinds are opt-in and are sent at or
 * after the learner's chosen hour, in their own time zone:
 *
 * - weekly: this week's plan, on the chosen weekday (once per week);
 * - nudge: a short "pick it back up" note after NUDGE_AFTER_DAYS days without study (once per quiet spell);
 * - exam: a countdown EXAM_COUNTDOWN_DAYS before each exam date (once per exam and day).
 *
 * Each reminder has a key; the sender records it before sending, so a key is never sent twice, even with two
 * schedulers running.
 */

export const NUDGE_AFTER_DAYS = 3;
export const EXAM_COUNTDOWN_DAYS = [7, 1] as const;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export interface ReminderPrefs {
  weekly: boolean;
  nudge: boolean;
  exam: boolean;
  /** Weekday for the weekly plan, 0 Sunday to 6 Saturday. */
  day: number;
  /** Hour of the day (0 to 23) from which reminders go out. */
  hour: number;
}

export interface ReminderContext {
  now: Date;
  timeZone: string;
  prefs: ReminderPrefs;
  /** Last day with any study (local date), or null when the learner has not studied yet. */
  lastStudyDay: IsoDate | null;
  /** Local date the learner finished onboarding; counts as the start of the first quiet spell. */
  onboardedDay: IsoDate;
  exams: { cert: string; examOn: IsoDate }[];
}

export type DueReminder =
  | { kind: "weekly"; key: string; weekOf: IsoDate }
  | { kind: "nudge"; key: string; idleDays: number }
  | { kind: "exam"; key: string; cert: string; examOn: IsoDate; daysLeft: number };

/** Weekday (0 Sunday) and hour in a time zone, falling back to UTC for an unknown zone. */
export function localClock(timeZone: string, now: Date): { weekday: number; hour: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  }
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd), hour };
}

export function dueReminders(ctx: ReminderContext): DueReminder[] {
  const { prefs } = ctx;
  const today = todayIn(ctx.timeZone, ctx.now);
  const clock = localClock(ctx.timeZone, ctx.now);
  if (clock.hour < prefs.hour) return [];
  const due: DueReminder[] = [];
  if (prefs.weekly && clock.weekday === prefs.day && ctx.exams.some((e) => e.examOn >= today)) {
    const weekOf = weekStart(today);
    due.push({ kind: "weekly", key: `weekly:${weekOf}`, weekOf });
  }
  if (prefs.nudge) {
    const since = ctx.lastStudyDay ?? ctx.onboardedDay;
    const idleDays = daysBetween(since, today);
    if (idleDays >= NUDGE_AFTER_DAYS) due.push({ kind: "nudge", key: `nudge:${since}`, idleDays });
  }
  if (prefs.exam) {
    for (const e of ctx.exams) {
      const daysLeft = daysBetween(today, e.examOn);
      if ((EXAM_COUNTDOWN_DAYS as readonly number[]).includes(daysLeft)) {
        due.push({ kind: "exam", key: `exam:${e.cert}:${e.examOn}:${daysLeft}`, cert: e.cert, examOn: e.examOn, daysLeft });
      }
    }
  }
  return due;
}
