import { daysBetween, type IsoDate } from "./dates.ts";
import type { Evidence, EvidenceSource } from "./readiness.ts";

/**
 * Turns a learner's activity into readiness evidence for one cert, each piece dated so that readiness can be
 * computed for any day (today, or the end of a past week for the history chart).
 */

export interface DatedEvidence {
  domainKey: string;
  correct: boolean;
  source: EvidenceSource;
  day: IsoDate;
}

/** The domain key of the first competency ref that belongs to the cert ("cka/storage/x" gives "storage"). */
export function domainOf(refs: readonly (string | undefined)[], certCode: string): string | undefined {
  const prefix = `${certCode.toLowerCase()}/`;
  const ref = refs.find((r) => r?.startsWith(prefix));
  return ref?.split("/")[1];
}

export interface GradedTask {
  id: string;
  competency?: string | undefined;
  checks: { id: string }[];
}

export interface GradedCheck {
  taskId: string;
  checkId: string;
  passed: boolean;
}

/**
 * One piece of evidence per task in a lab or mock exam's final grading: right when every check of the task
 * passed. A task is placed in the domain of its own competency (mock exams), else of the lab's first
 * competency for the cert. Tasks without checks or without results are skipped.
 */
export function taskEvidence(
  tasks: readonly GradedTask[],
  labRefs: readonly string[],
  certCode: string,
  results: readonly GradedCheck[],
  source: "lab" | "mock",
  day: IsoDate,
): DatedEvidence[] {
  const out: DatedEvidence[] = [];
  for (const task of tasks) {
    if (task.checks.length === 0) continue;
    const mine = results.filter((r) => r.taskId === task.id);
    if (mine.length === 0) continue;
    const domainKey = domainOf([task.competency, ...labRefs], certCode);
    if (!domainKey) continue;
    out.push({ domainKey, correct: mine.every((r) => r.passed), source, day });
  }
  return out;
}

/** Lab sessions count as lab evidence; a mock exam in exam mode counts as a mock, in practice mode as a lab. */
export function sessionSource(mode: "lab" | "exam" | "practice"): "lab" | "mock" {
  return mode === "exam" ? "mock" : "lab";
}

/** Evidence as of `asOf`: later evidence is dropped and the rest is aged. */
export function evidenceAsOf(rows: readonly DatedEvidence[], asOf: IsoDate): Evidence[] {
  return rows.filter((r) => r.day <= asOf).map((r) => ({ domainKey: r.domainKey, correct: r.correct, source: r.source, ageDays: daysBetween(r.day, asOf) }));
}
