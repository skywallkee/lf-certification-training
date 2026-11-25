/** Lab session states. The web app writes `requested`; the lab controller owns every later change. */
export const SESSION_STATUSES = ["requested", "booting", "ready", "finished", "expired", "failed", "killed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** States that hold resources and count as the learner's one active session. */
export const ACTIVE_STATUSES = ["requested", "booting", "ready"] as const satisfies readonly SessionStatus[];

export function isActive(status: string): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

/**
 * Boot steps, in order. The controller stores the index of the step it is on; the player shows them all with
 * the task text readable meanwhile.
 */
export const BOOT_STEPS = [
  { key: "images", label: "Preparing images" },
  { key: "cluster", label: "Starting the cluster" },
  { key: "api", label: "Waiting for the Kubernetes API" },
  { key: "load-images", label: "Loading images into the cluster" },
  { key: "setup", label: "Setting up the task" },
  { key: "terminal", label: "Opening your terminal" },
] as const;
export type BootStepKey = (typeof BOOT_STEPS)[number]["key"];

export function bootStepIndex(key: BootStepKey): number {
  return BOOT_STEPS.findIndex((s) => s.key === key);
}

export interface CheckResult {
  taskId: string;
  checkId: string;
  passed: boolean;
  message: string;
  detail?: string;
}

export interface TaskWeight {
  id: string;
  weight: number;
  checks: { id: string }[];
}

/**
 * Score in percent: each task contributes its weight times the share of its checks that passed, so a task with
 * two checks and one passing earns half its weight (partial credit, as in the real exams' per-task scoring).
 */
export function scoreOf(tasks: TaskWeight[], results: CheckResult[]): number {
  const passed = new Set(results.filter((r) => r.passed).map((r) => `${r.taskId}/${r.checkId}`));
  let score = 0;
  for (const task of tasks) {
    if (task.checks.length === 0) continue;
    const ok = task.checks.filter((c) => passed.has(`${task.id}/${c.id}`)).length;
    score += (task.weight * ok) / task.checks.length;
  }
  return Math.round(score);
}

/** Per-task summary for the task panel: passed, failed (some checks failing) or not checked yet. */
export function taskStates(tasks: TaskWeight[], results: CheckResult[] | undefined): Record<string, "passed" | "failed" | "unchecked"> {
  const out: Record<string, "passed" | "failed" | "unchecked"> = {};
  for (const task of tasks) {
    const mine = (results ?? []).filter((r) => r.taskId === task.id);
    out[task.id] = mine.length === 0 ? "unchecked" : mine.every((r) => r.passed) ? "passed" : "failed";
  }
  return out;
}
