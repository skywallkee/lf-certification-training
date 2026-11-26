import "server-only";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { answer, labSession, lessonProgress, studyTarget } from "@/db/schema";
import { addDays, dateIn, type IsoDate } from "@/lib/dates";
import { buildPlan, studyMinutes, weekStart, type StudyPlan } from "@/lib/study-plan";
import type { Catalog, CatalogCert } from "./catalog";
import { listLabs } from "./labs";
import { listMocks } from "./mocks";
import { getReadiness, getReported } from "./progress";

/** The date a plan counts down to: the booked exam when there is one, otherwise the learner's target date. */
export interface ExamDate {
  cert: string;
  examOn: IsoDate;
  booked: boolean;
}

export async function getExamDates(userId: string): Promise<Map<string, ExamDate>> {
  const [reported, targets] = await Promise.all([
    getReported(userId),
    getDb().select().from(studyTarget).where(eq(studyTarget.userId, userId)),
  ]);
  const out = new Map<string, ExamDate>();
  for (const t of targets) out.set(t.certCode, { cert: t.certCode, examOn: t.examOn, booked: false });
  for (const [cert, r] of reported) {
    if (r.state === "booked" && r.bookedFor) out.set(cert, { cert, examOn: r.bookedFor, booked: true });
    // A passed cert needs no plan, even if a stale target is left.
    if (r.state === "passed") out.delete(cert);
  }
  return out;
}

export interface CertPlan {
  cert: CatalogCert;
  date: ExamDate | null;
  plan: StudyPlan | null;
  focus: boolean;
}

/**
 * Plans for every cert with an exam date, plus the focus cert (without a date it gets a prompt to set one).
 * Soonest exam first.
 */
export async function getPlans(
  userId: string,
  catalog: Catalog,
  opts: { today: IsoDate; hoursPerWeek: number | null; focusCert: string | null },
): Promise<CertPlan[]> {
  const [dates, labs, mocks] = await Promise.all([getExamDates(userId), listLabs(), listMocks()]);
  const codes = new Set([...dates.keys()]);
  const reported = await getReported(userId);
  if (opts.focusCert && reported.get(opts.focusCert)?.state !== "passed") codes.add(opts.focusCert);
  const plans = await Promise.all(
    [...codes].flatMap((code) => {
      const cert = catalog.certs.get(code);
      if (!cert) return [];
      return [
        (async (): Promise<CertPlan> => {
          const date = dates.get(code) ?? null;
          if (!date) return { cert, date, plan: null, focus: code === opts.focusCert };
          const readiness = await getReadiness(userId, cert, opts.today);
          const plan = buildPlan({
            cert: code,
            examStyle: cert.examStyle,
            today: opts.today,
            examOn: date.examOn,
            hoursPerWeek: opts.hoursPerWeek ?? 4,
            domains: readiness.domains.map((d) => ({ key: d.key, name: d.name, weight: d.weight, mastery: d.mastery, answers: d.answers })),
            hasLabs: labs.some((l) => l.certCode === code),
            hasMock: mocks.some((m) => m.certCode === code),
          });
          return { cert, date, plan, focus: code === opts.focusCert };
        })(),
      ];
    }),
  );
  return plans.sort(
    (a, b) => (a.date ? 0 : 1) - (b.date ? 0 : 1) || (a.date?.examOn ?? "").localeCompare(b.date?.examOn ?? "") || Number(b.focus) - Number(a.focus),
  );
}

export interface StudyActivity {
  /** Rough study minutes this week (Monday to today, local time), from answers, lessons, labs and mocks. */
  thisWeekMinutes: number;
  lastWeekMinutes: number;
  /** Last local day with any study, or null. */
  lastStudyDay: IsoDate | null;
}

/** Study time this week and last, and the last study day, in the learner's time zone. */
export async function getStudyActivity(userId: string, catalog: Catalog, timeZone: string, today: IsoDate): Promise<StudyActivity> {
  const db = getDb();
  const lastMonday = addDays(weekStart(today), -7);
  // A day of slack on each side of the local week boundary; rows are filtered by local date below.
  const since = new Date(`${addDays(lastMonday, -1)}T00:00:00Z`);
  const [answers, lessons, sessions, lastAnswer, lastLesson, lastSession] = await Promise.all([
    db.select({ at: answer.answeredAt }).from(answer).where(and(eq(answer.userId, userId), gte(answer.answeredAt, since))),
    db.select({ id: lessonProgress.lessonId, at: lessonProgress.completedAt }).from(lessonProgress).where(and(eq(lessonProgress.userId, userId), gte(lessonProgress.completedAt, since))),
    db
      .select({ start: labSession.readyAt, startedAt: labSession.startedAt, end: labSession.endedAt })
      .from(labSession)
      .where(and(eq(labSession.userId, userId), isNotNull(labSession.endedAt), gte(labSession.endedAt, since))),
    db.select({ at: answer.answeredAt }).from(answer).where(eq(answer.userId, userId)).orderBy(desc(answer.answeredAt)).limit(1),
    db.select({ at: lessonProgress.completedAt }).from(lessonProgress).where(eq(lessonProgress.userId, userId)).orderBy(desc(lessonProgress.completedAt)).limit(1),
    db.select({ at: labSession.endedAt }).from(labSession).where(and(eq(labSession.userId, userId), isNotNull(labSession.endedAt))).orderBy(desc(labSession.endedAt)).limit(1),
  ]);
  const thisMonday = weekStart(today);
  const inWeek = (at: Date, from: IsoDate, to: IsoDate) => {
    const d = dateIn(timeZone, at);
    return d >= from && d <= to;
  };
  const tally = (from: IsoDate, to: IsoDate) =>
    studyMinutes({
      answers: answers.filter((a) => inWeek(a.at, from, to)).length,
      lessonMinutes: lessons.filter((l) => inWeek(l.at, from, to)).reduce((s, l) => s + (catalog.lessonsById.get(l.id)?.minutes ?? 10), 0),
      sessionMinutes: sessions
        .filter((s) => s.end && inWeek(s.end, from, to))
        .reduce((sum, s) => {
          const start = s.startedAt ?? s.start;
          if (!start || !s.end) return sum;
          return sum + Math.min(240, Math.max(0, (s.end.getTime() - start.getTime()) / 60_000));
        }, 0),
    });
  const lastAt = [lastAnswer[0]?.at, lastLesson[0]?.at, lastSession[0]?.at].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0];
  return {
    thisWeekMinutes: tally(thisMonday, today),
    lastWeekMinutes: tally(lastMonday, addDays(thisMonday, -1)),
    lastStudyDay: lastAt ? dateIn(timeZone, lastAt) : null,
  };
}
