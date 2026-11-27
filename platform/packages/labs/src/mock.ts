/**
 * Practical mock exams. A mock attempt is a lab session with a mode: "exam" (no feedback until the end, as in
 * the real exam) or "practice" (a Check button per task). The clusters boot first (the prepare screen); the
 * clock starts when the learner presses Start, and an attempt that is never started ends after a short
 * window. No Node imports: the browser bundle uses this file.
 */
import { nextMonthStart } from "./quota.ts";
import type { SlotDecision } from "./capacity.ts";
import type { CheckResult, TaskWeight } from "./status.ts";

export const MOCK_MODES = ["exam", "practice"] as const;
export type MockMode = (typeof MOCK_MODES)[number];
export type SessionMode = "lab" | MockMode;

export function isMockMode(mode: string): mode is MockMode {
  return (MOCK_MODES as readonly string[]).includes(mode);
}

/** Minutes a ready attempt waits for Start before it is removed (nothing counts against the quota then). */
export const START_WINDOW_MINUTES = 15;

/** Default attempts per learner, per cert, per calendar month (UTC), per mode. */
export const DEFAULT_MOCK_QUOTA: Record<MockMode, number> = { exam: 2, practice: 2 };

export type MockStartBlock =
  | { reason: "active-session"; sessionId: string }
  | { reason: "quota"; used: number; allowed: number; resetsOn: Date }
  | { reason: "capacity"; position: number | null; waiting: number }
  | { reason: "controller-down" };

export interface MockStartInput {
  /** Attempts in this mode for this cert this month that were started (pressed Start). */
  used: number;
  allowed: number;
  activeSessionId: string | null;
  /** Room on the machine for this learner now (capacity.ts slotFor). */
  slot: SlotDecision;
  controllerUp: boolean;
  now: Date;
}

/**
 * Why a learner cannot start a mock attempt now, or null. Mocks have their own monthly allowance in attempts
 * and do not use lab minutes. Only attempts that reached Start count, so failed boots and attempts left on
 * the prepare screen are free.
 */
export function mockStartBlock(input: MockStartInput): MockStartBlock | null {
  if (input.activeSessionId) return { reason: "active-session", sessionId: input.activeSessionId };
  if (!input.controllerUp) return { reason: "controller-down" };
  if (input.used >= input.allowed) return { reason: "quota", used: input.used, allowed: input.allowed, resetsOn: nextMonthStart(input.now) };
  if (!input.slot.ok) return { reason: "capacity", position: input.slot.position, waiting: input.slot.waiting };
  return null;
}

export interface TaskScore {
  taskId: string;
  weight: number;
  /** Points earned out of the task's weight, with partial credit per passed check (one decimal). */
  earned: number;
  passedChecks: number;
  totalChecks: number;
}

/** Score per task: weight times the share of its checks that passed. */
export function taskScores(tasks: TaskWeight[], results: CheckResult[]): TaskScore[] {
  const passed = new Set(results.filter((r) => r.passed).map((r) => `${r.taskId}/${r.checkId}`));
  return tasks.map((t) => {
    const ok = t.checks.filter((c) => passed.has(`${t.id}/${c.id}`)).length;
    const earned = t.checks.length === 0 ? 0 : Math.round(((t.weight * ok) / t.checks.length) * 10) / 10;
    return { taskId: t.id, weight: t.weight, earned, passedChecks: ok, totalChecks: t.checks.length };
  });
}

export interface DomainScore {
  /** Domain slug, the middle part of a competency id (cka/<domain>/<competency>). */
  domain: string;
  earned: number;
  possible: number;
  /** Earned as a percentage of what the domain's tasks were worth. */
  percent: number;
  taskIds: string[];
}

/** Groups task scores by the domain of each task's competency, weakest domain first. */
export function domainScores(tasks: (TaskWeight & { competency?: string | undefined })[], results: CheckResult[]): DomainScore[] {
  const scores = new Map(taskScores(tasks, results).map((s) => [s.taskId, s]));
  const byDomain = new Map<string, DomainScore>();
  for (const t of tasks) {
    const domain = t.competency?.split("/")[1] ?? "other";
    const d = byDomain.get(domain) ?? { domain, earned: 0, possible: 0, percent: 0, taskIds: [] };
    d.earned += scores.get(t.id)?.earned ?? 0;
    d.possible += t.weight;
    d.taskIds.push(t.id);
    byDomain.set(domain, d);
  }
  return [...byDomain.values()]
    .map((d) => ({ ...d, earned: Math.round(d.earned * 10) / 10, percent: d.possible === 0 ? 0 : Math.round((d.earned / d.possible) * 100) }))
    .sort((a, b) => a.percent - b.percent || a.domain.localeCompare(b.domain));
}
