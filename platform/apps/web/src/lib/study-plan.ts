import { addDays, daysBetween, type IsoDate } from "./dates.ts";
import { READY_AT } from "./readiness.ts";

/**
 * A weekly study plan from today to the exam date, built from readiness and the learner's study hours.
 *
 * 1. Hours needed: a full course for the exam style (BASE_HOURS) scaled by how far each domain is from the
 *    book-ready mark, weighted by the official domain weights. A domain with no graded evidence counts as 0%.
 * 2. Hours available: the learner's weekly hours for every week up to the exam; this week and the exam week only
 *    count the days left in them. Comparing the two gives the pace (on track, tight or behind).
 * 3. Weeks: the exam week is light review only; the week before it (when there is one) is a timed mock exam and
 *    weak spots; the weeks before that work through the domains, the biggest remaining need first, two per week.
 *
 * Every number here is an estimate to steer the week, not a promise. The constants are defaults chosen without
 * product input (see ADR 0019).
 */

/** Hours a learner starting from zero needs to reach book-ready, per exam style. */
export const BASE_HOURS: Record<ExamStyle, number> = { performance: 40, "multiple-choice": 20 };
/** Share of each week's hours kept for the review queue, capped. */
export const REVIEW_SHARE = 0.15;
export const REVIEW_CAP_MINUTES = 90;
/** Length of a hands-on lab and of a timed mock exam, in minutes. */
export const LAB_MINUTES = 45;
export const MOCK_MINUTES: Record<ExamStyle, number> = { performance: 120, "multiple-choice": 90 };
/** Pace thresholds: available hours over needed hours. */
export const ON_TRACK_RATIO = 1.1;
export const TIGHT_RATIO = 0.8;
/** Domains worked on in one learning week. */
const DOMAINS_PER_WEEK = 2;

export type ExamStyle = "performance" | "multiple-choice";

export interface PlanDomain {
  key: string;
  name: string;
  weight: number;
  mastery: number;
  /** Graded items; with none the domain counts as 0% for the plan. */
  answers: number;
}

export interface PlanInput {
  cert: string;
  examStyle: ExamStyle;
  today: IsoDate;
  examOn: IsoDate;
  hoursPerWeek: number;
  domains: PlanDomain[];
  hasLabs: boolean;
  hasMock: boolean;
}

export type TaskKind = "study" | "lab" | "review" | "mock" | "quiz" | "rest" | "exam";

export interface PlanTask {
  kind: TaskKind;
  label: string;
  minutes: number;
  href?: string;
  domainKey?: string;
}

export type WeekPhase = "learn" | "prepare" | "exam";

export interface PlanWeek {
  /** Monday of the week (ISO weeks), clipped to today for the first week. */
  start: IsoDate;
  /** Sunday of the week, clipped to the exam date for the last week. */
  end: IsoDate;
  phase: WeekPhase;
  minutes: number;
  tasks: PlanTask[];
  /** Domains this week works on, by name. */
  focus: string[];
}

export type Pace = "on-track" | "tight" | "behind" | "ready";

export interface StudyPlan {
  cert: string;
  examOn: IsoDate;
  daysLeft: number;
  hoursNeeded: number;
  hoursAvailable: number;
  pace: Pace;
  /** One sentence on the pace, with what to change when it is tight or behind. */
  paceNote: string;
  /** Extra hours a week that would put the plan on track (0 when it already is). */
  extraHoursPerWeek: number;
  weeks: PlanWeek[];
}

/** Monday on or before the date. */
export function weekStart(date: IsoDate): IsoDate {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 Sunday
  return addDays(date, -((day + 6) % 7));
}

/** How far a domain is from book-ready, from 0 (there) to 1 (no evidence). */
export function domainGap(d: PlanDomain): number {
  const m = d.answers > 0 ? d.mastery : 0;
  return Math.max(0, READY_AT - m) / READY_AT;
}

export function hoursNeeded(examStyle: ExamStyle, domains: PlanDomain[]): number {
  const total = domains.reduce((s, d) => s + d.weight, 0) || 1;
  const gap = domains.reduce((s, d) => s + (d.weight / total) * domainGap(d), 0);
  return Math.round(BASE_HOURS[examStyle] * gap * 10) / 10;
}

function roundTo5(minutes: number): number {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function buildPlan(input: PlanInput): StudyPlan {
  const { today, examOn, cert, examStyle } = input;
  const daysLeft = daysBetween(today, examOn);
  const needed = hoursNeeded(examStyle, input.domains);
  const lower = cert.toLowerCase();
  const weeklyMinutes = Math.max(1, input.hoursPerWeek) * 60;

  // Weeks from this week to the exam week. Study days in a week: today (or Monday) to Sunday, and up to the day
  // before the exam in the exam week.
  const spans: { start: IsoDate; end: IsoDate; studyDays: number }[] = [];
  if (daysLeft >= 0) {
    for (let monday = weekStart(today); monday <= examOn; monday = addDays(monday, 7)) {
      const start = monday < today ? today : monday;
      const sunday = addDays(monday, 6);
      const end = sunday > examOn ? examOn : sunday;
      const lastStudyDay = end === examOn ? addDays(examOn, -1) : end;
      spans.push({ start, end, studyDays: Math.max(0, daysBetween(start, lastStudyDay) + 1) });
    }
  }
  const minutesFor = (studyDays: number) => roundTo5((weeklyMinutes * Math.min(7, studyDays)) / 7);
  const available = spans.reduce((s, w) => s + (w.studyDays > 0 ? minutesFor(w.studyDays) : 0), 0) / 60;

  // Remaining need per domain, in minutes, shared out by weight times gap.
  const total = input.domains.reduce((s, d) => s + d.weight, 0) || 1;
  const gapWeight = input.domains.map((d) => (d.weight / total) * domainGap(d));
  const gapSum = gapWeight.reduce((s, g) => s + g, 0);
  const remaining = new Map(input.domains.map((d, i) => [d.key, gapSum > 0 ? (needed * 60 * gapWeight[i]!) / gapSum : 0]));
  const byKey = new Map(input.domains.map((d) => [d.key, d]));
  const weakest = [...input.domains].sort((a, b) => domainGap(b) * b.weight - domainGap(a) * a.weight)[0];

  const weeks: PlanWeek[] = spans.map((span, i) => {
    const isExamWeek = i === spans.length - 1;
    const isPrepWeek = !isExamWeek && i === spans.length - 2 && spans.length >= 3;
    const phase: WeekPhase = isExamWeek ? "exam" : isPrepWeek ? "prepare" : "learn";
    const minutes = span.studyDays > 0 ? minutesFor(span.studyDays) : 0;
    const tasks: PlanTask[] = [];
    const focus: string[] = [];
    let left = minutes;

    if (minutes > 0) {
      const review = roundTo5(Math.min(REVIEW_CAP_MINUTES, minutes * (phase === "exam" ? 0.4 : REVIEW_SHARE)));
      tasks.push({ kind: "review", label: "Clear your review queue, a few minutes a day", minutes: review, href: "/review" });
      left -= review;
    }

    if (phase === "exam") {
      if (left > 0 && weakest) {
        tasks.push({
          kind: "quiz",
          label: `Light practice on ${weakest.name}, no new material`,
          minutes: roundTo5(left),
          href: `/practice?cert=${cert}&domains=${weakest.key}`,
          domainKey: weakest.key,
        });
        focus.push(weakest.name);
      }
      tasks.push({ kind: "rest", label: "Rest the day before. Check your ID and the exam check-in steps.", minutes: 0 });
      tasks.push({ kind: "exam", label: `${cert} exam`, minutes: 0 });
      return { start: span.start, end: span.end, phase, minutes, tasks, focus };
    }

    if (phase === "prepare") {
      const mockMinutes = Math.min(left, MOCK_MINUTES[examStyle]);
      if (mockMinutes > 0) {
        tasks.push(
          input.hasMock
            ? { kind: "mock", label: `Take a timed ${cert} mock exam in exam mode`, minutes: roundTo5(mockMinutes), href: "/mocks" }
            : { kind: "quiz", label: `Take a long mixed ${cert} practice quiz, feedback at the end`, minutes: roundTo5(mockMinutes), href: `/practice?cert=${cert}` },
        );
        left -= mockMinutes;
      }
    }

    // Learning: up to two domains with the biggest remaining need (or, once every need is met, the weakest by
    // weight so the knowledge stays fresh).
    if (left > 0) {
      const ranked = [...remaining].filter(([, r]) => r > 0).sort((a, b) => b[1] - a[1]);
      const picks = (ranked.length > 0 ? ranked.map(([k]) => k) : weakest ? [weakest.key] : []).slice(0, DOMAINS_PER_WEEK);
      const lab = input.hasLabs && examStyle === "performance" && phase === "learn" && left >= LAB_MINUTES + 30;
      let studyLeft = left - (lab ? LAB_MINUTES : 0);
      const needSum = picks.reduce((s, k) => s + remaining.get(k)!, 0);
      picks.forEach((key, j) => {
        const d = byKey.get(key)!;
        // The first domain gets its share of the remaining need (30 to 70% of the week), capped at what it still
        // needs; the last one gets the rest.
        const share =
          j === picks.length - 1
            ? studyLeft
            : Math.min(studyLeft * Math.min(0.7, Math.max(0.3, needSum > 0 ? remaining.get(key)! / needSum : 0.5)), Math.max(15, remaining.get(key)!));
        if (share < 5 || studyLeft < 5) return;
        const m = roundTo5(share);
        studyLeft -= share;
        remaining.set(key, Math.max(0, remaining.get(key)! - share));
        focus.push(d.name);
        const fresh = ranked.length === 0;
        tasks.push({
          kind: "study",
          label:
            phase === "prepare"
              ? `Fix weak spots in ${d.name}`
              : fresh
                ? `Keep ${d.name} fresh with practice questions`
                : `Lessons and practice questions on ${d.name}`,
          minutes: m,
          href: phase === "prepare" || fresh ? `/practice?cert=${cert}&domains=${key}` : `/certs/${lower}/domains/${key}`,
          domainKey: key,
        });
      });
      if (lab) {
        const labDomain = picks[0] ? byKey.get(picks[0]) : undefined;
        tasks.push({ kind: "lab", label: labDomain ? `Solve a hands-on lab, ideally on ${labDomain.name}` : "Solve a hands-on lab", minutes: LAB_MINUTES, href: "/labs" });
      }
    }
    return { start: span.start, end: span.end, phase, minutes, tasks, focus };
  });

  const ratio = needed === 0 ? Infinity : available / needed;
  const pace: Pace = needed === 0 ? "ready" : ratio >= ON_TRACK_RATIO ? "on-track" : ratio >= TIGHT_RATIO ? "tight" : "behind";
  const weeksLeft = Math.max(1, available / Math.max(1, input.hoursPerWeek));
  const extra = pace === "tight" || pace === "behind" ? Math.ceil((needed * ON_TRACK_RATIO - available) / weeksLeft) : 0;
  const paceNote =
    daysLeft < 0
      ? "This exam date has passed. Set a new date, or mark the cert passed on your path."
      : pace === "ready"
        ? "Every domain is at the book-ready mark. Keep it fresh with review and a timed mock."
        : pace === "on-track"
          ? `About ${Math.round(needed)} hours of study left and ${Math.round(available)} hours until the exam at your pace. You are on track.`
          : pace === "tight"
            ? `About ${Math.round(needed)} hours left and ${Math.round(available)} hours until the exam. It is tight: add ${extra} hour${extra === 1 ? "" : "s"} a week, or move the date.`
            : `About ${Math.round(needed)} hours left but only ${Math.round(available)} hours until the exam. Add ${extra} hour${extra === 1 ? "" : "s"} a week, or move the exam to a later date.`;

  return {
    cert,
    examOn,
    daysLeft,
    hoursNeeded: needed,
    hoursAvailable: Math.round(available * 10) / 10,
    pace: daysLeft < 0 ? "behind" : pace,
    paceNote,
    extraHoursPerWeek: Math.max(0, extra),
    weeks,
  };
}

/** Rough study minutes from activity: a question 1.5 min, a lesson its own length, a lab or mock its real time. */
export const MINUTES_PER_ANSWER = 1.5;

export function studyMinutes(activity: { answers: number; lessonMinutes: number; sessionMinutes: number }): number {
  return Math.round(activity.answers * MINUTES_PER_ANSWER + activity.lessonMinutes + activity.sessionMinutes);
}
