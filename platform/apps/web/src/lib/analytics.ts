import { addDays, daysBetween, type IsoDate } from "./dates.ts";

/**
 * Admin analytics, computed from the learner tables the app already keeps (answers, lessons, lab sessions); there
 * is no separate event log. These functions are pure so they can be unit tested; server/analytics.ts loads the rows.
 * Admin accounts are left out of every number before rows reach here.
 */

/** Time windows the analytics page offers, in weeks. */
export const RANGE_WEEKS = [4, 12, 26] as const;
export type RangeWeeks = (typeof RANGE_WEEKS)[number];
export const DEFAULT_RANGE: RangeWeeks = 12;

export function parseRange(value: string | undefined): RangeWeeks {
  const n = Number(value);
  return (RANGE_WEEKS as readonly number[]).includes(n) ? (n as RangeWeeks) : DEFAULT_RANGE;
}

/** A domain or question needs this many graded answers (or lab tasks) before it can be called weak. */
export const MIN_DOMAIN_EVIDENCE = 20;
export const MIN_QUESTION_ANSWERS = 5;

/** The Monday of the week holding `day` (weeks run Monday to Sunday, in UTC). */
export function weekOf(day: IsoDate): IsoDate {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

/** The Mondays of the last `weeks` weeks, oldest first, ending with the current week. */
export function weekStarts(today: IsoDate, weeks: number): IsoDate[] {
  const current = weekOf(today);
  return Array.from({ length: weeks }, (_, i) => addDays(current, (i - weeks + 1) * 7));
}

/** The first day the window covers: the Monday `weeks - 1` weeks before this one. */
export function rangeStart(today: IsoDate, weeks: number): IsoDate {
  return weekStarts(today, weeks)[0]!;
}

/** A learner did something on a day: answered a question, finished a lesson, or started a lab or mock exam. */
export interface ActivityDay {
  userId: string;
  day: IsoDate;
}

export interface WeekCount {
  week: IsoDate;
  value: number;
}

/** Distinct active learners per week, for every week in the window (zero when nobody was active). */
export function weeklyActive(rows: readonly ActivityDay[], today: IsoDate, weeks: number): WeekCount[] {
  const sets = new Map(weekStarts(today, weeks).map((w) => [w, new Set<string>()]));
  for (const r of rows) sets.get(weekOf(r.day))?.add(r.userId);
  return [...sets].map(([week, s]) => ({ week, value: s.size }));
}

/** Distinct learners active in the last `days` days, today included. */
export function activeWithin(rows: readonly ActivityDay[], today: IsoDate, days: number): number {
  const from = addDays(today, -(days - 1));
  return new Set(rows.filter((r) => r.day >= from && r.day <= today).map((r) => r.userId)).size;
}

/** Change from the previous value as a whole percent, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** One graded piece of evidence: an answer, or a task in a lab or mock exam's final grading. */
export interface DomainEvidence {
  userId: string;
  certCode: string;
  domainKey: string;
  correct: boolean;
  source: "question" | "task";
}

export interface DomainRow {
  certCode: string;
  domainKey: string;
  learners: number;
  answers: number;
  tasks: number;
  correct: number;
  /** Share right, 0 to 1. */
  accuracy: number;
}

/**
 * Accuracy per cert domain across learners, weakest first. Domains with fewer than `minEvidence` pieces of evidence
 * are left out, since a handful of answers says little about a whole cohort.
 */
export function domainWeakness(rows: readonly DomainEvidence[], minEvidence = MIN_DOMAIN_EVIDENCE): DomainRow[] {
  const by = new Map<string, DomainRow & { users: Set<string> }>();
  for (const r of rows) {
    const key = `${r.certCode}/${r.domainKey}`;
    let d = by.get(key);
    if (!d) {
      d = { certCode: r.certCode, domainKey: r.domainKey, learners: 0, answers: 0, tasks: 0, correct: 0, accuracy: 0, users: new Set() };
      by.set(key, d);
    }
    d.users.add(r.userId);
    if (r.source === "question") d.answers += 1;
    else d.tasks += 1;
    if (r.correct) d.correct += 1;
  }
  return [...by.values()]
    .filter((d) => d.answers + d.tasks >= minEvidence)
    .map(({ users, ...d }) => ({ ...d, learners: users.size, accuracy: d.correct / (d.answers + d.tasks) }))
    .sort((a, b) => a.accuracy - b.accuracy || b.answers + b.tasks - (a.answers + a.tasks) || a.certCode.localeCompare(b.certCode));
}

/** Answers to one question by one learner in the window. */
export interface QuestionTally {
  questionId: string;
  userId: string;
  answers: number;
  correct: number;
}

export interface QuestionRow {
  questionId: string;
  learners: number;
  answers: number;
  accuracy: number;
}

/** The questions learners miss most, weakest first, among those answered at least `minAnswers` times. */
export function questionWeakness(rows: readonly QuestionTally[], minAnswers = MIN_QUESTION_ANSWERS, limit = 10): QuestionRow[] {
  const by = new Map<string, { learners: number; answers: number; correct: number }>();
  for (const r of rows) {
    const q = by.get(r.questionId) ?? { learners: 0, answers: 0, correct: 0 };
    q.learners += 1;
    q.answers += r.answers;
    q.correct += r.correct;
    by.set(r.questionId, q);
  }
  return [...by]
    .filter(([, q]) => q.answers >= minAnswers)
    .map(([questionId, q]) => ({ questionId, learners: q.learners, answers: q.answers, accuracy: q.correct / q.answers }))
    .sort((a, b) => a.accuracy - b.accuracy || b.answers - a.answers || a.questionId.localeCompare(b.questionId))
    .slice(0, limit);
}

/** A lab session or mock exam attempt, with what the lab defines. */
export interface UsageSession {
  userId: string;
  labId: string;
  mode: "lab" | "exam" | "practice";
  status: string;
  createdAt: Date;
  readyAt: Date | null;
  endedAt: Date | null;
  expiresAt: Date | null;
  score: number | null;
  /** How many clusters the lab boots. */
  clusters: number;
  /** Mock exams: pass mark in percent. */
  passPercent: number | null;
}

/**
 * Minutes the session's clusters were up: from ready to the end (or now while it runs), never past its expiry.
 * For a mock exam this includes the prepare screen, since the clusters run (and would cost) from the moment they
 * are ready.
 */
export function sessionMinutes(s: Pick<UsageSession, "readyAt" | "endedAt" | "expiresAt">, now: Date): number {
  if (!s.readyAt) return 0;
  let end = (s.endedAt ?? now).getTime();
  if (s.expiresAt) end = Math.min(end, s.expiresAt.getTime());
  return Math.max(0, Math.ceil((end - s.readyAt.getTime()) / 60_000));
}

export interface UsageRow {
  labId: string;
  starts: number;
  learners: number;
  /** Ended with a final grading (finished by the learner or at the time limit). */
  completed: number;
  /** Never booted. */
  failed: number;
  /** Stopped by an admin. */
  killed: number;
  /** Graded attempts at or above the pass mark (mock exams only). */
  passed: number;
  averageScore: number | null;
  minutes: number;
  /** Minutes times clusters: the number that becomes a cloud bill once labs run on VMs. */
  clusterMinutes: number;
}

const ENDED_GRADED = new Set(["finished", "expired"]);

function emptyUsage(labId: string): UsageRow & { users: Set<string>; scores: number[] } {
  return { labId, starts: 0, learners: 0, completed: 0, failed: 0, killed: 0, passed: 0, averageScore: null, minutes: 0, clusterMinutes: 0, users: new Set(), scores: [] };
}

function addSession(u: ReturnType<typeof emptyUsage>, s: UsageSession, now: Date) {
  u.starts += 1;
  u.users.add(s.userId);
  if (s.status === "failed") u.failed += 1;
  if (s.status === "killed") u.killed += 1;
  if (ENDED_GRADED.has(s.status) && s.score !== null) {
    u.completed += 1;
    u.scores.push(s.score);
    if (s.passPercent !== null && s.score >= s.passPercent) u.passed += 1;
  }
  const m = sessionMinutes(s, now);
  u.minutes += m;
  u.clusterMinutes += m * Math.max(1, s.clusters);
}

function finish({ users, scores, ...u }: ReturnType<typeof emptyUsage>): UsageRow {
  return { ...u, learners: users.size, averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null };
}

/** Usage per lab or mock exam, most started first. */
export function usageByLab(sessions: readonly UsageSession[], now: Date): UsageRow[] {
  const by = new Map<string, ReturnType<typeof emptyUsage>>();
  for (const s of sessions) {
    const u = by.get(s.labId) ?? emptyUsage(s.labId);
    addSession(u, s, now);
    by.set(s.labId, u);
  }
  return [...by.values()].map(finish).sort((a, b) => b.starts - a.starts || b.clusterMinutes - a.clusterMinutes || a.labId.localeCompare(b.labId));
}

/** Totals across sessions (same fields as a row; labId is "all"). */
export function usageTotals(sessions: readonly UsageSession[], now: Date): UsageRow {
  const u = emptyUsage("all");
  for (const s of sessions) addSession(u, s, now);
  return finish(u);
}

/** Cluster minutes per week, by the week each session's clusters became ready. */
export function weeklyClusterMinutes(sessions: readonly UsageSession[], today: IsoDate, weeks: number, now: Date): WeekCount[] {
  const sums = new Map(weekStarts(today, weeks).map((w) => [w, 0]));
  for (const s of sessions) {
    if (!s.readyAt) continue;
    const week = weekOf(s.readyAt.toISOString().slice(0, 10));
    if (sums.has(week)) sums.set(week, sums.get(week)! + sessionMinutes(s, now) * Math.max(1, s.clusters));
  }
  return [...sums].map(([week, value]) => ({ week, value }));
}

/** Share of a part, as a whole percent; null when the whole is zero. */
export function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

/** Days in the window, today included (for "per day" figures). */
export function rangeDays(today: IsoDate, weeks: number): number {
  return daysBetween(rangeStart(today, weeks), today) + 1;
}
