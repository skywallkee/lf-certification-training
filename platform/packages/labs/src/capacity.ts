/**
 * Machine capacity and the waiting line. A self-hosted server runs only so many clusters at once, so every lab
 * session and mock attempt takes one slot, plus one cluster per kubectl context it boots (a three-cluster mock
 * takes three). When a start does not fit, the learner joins a first-come, first-served line and their lab
 * starts as soon as enough room is free. No Node imports: the browser bundle uses this file.
 */

export interface CapacityLimits {
  /** Concurrent sessions (labs and mock attempts together). */
  maxSessions: number;
  /** Concurrent clusters across all sessions; null for no limit beyond maxSessions. */
  maxClusters: number | null;
}

export interface Running {
  sessions: number;
  clusters: number;
}

export interface Waiting {
  userId: string;
  /** Clusters the queued lab or mock boots. */
  clusters: number;
}

/** A queue entry counts only while its page keeps checking in; a learner who left drops out after this long. */
export const QUEUE_STALE_SECONDS = 45;
/** How often the waiting page checks in and asks whether it is its turn. */
export const QUEUE_POLL_SECONDS = 5;

/** Whether one more session with this many clusters fits next to what is running. */
export function fits(
  running: Running,
  limits: CapacityLimits,
  clusters: number,
): boolean {
  if (running.sessions + 1 > limits.maxSessions) return false;
  if (
    limits.maxClusters !== null &&
    running.clusters + clusters > limits.maxClusters
  )
    return false;
  return true;
}

/**
 * The learners whose turn it is: walking the line from the front, everyone who fits while the ones before them
 * are counted as started. Strictly in order: when the first in line needs more clusters than are free, nobody
 * behind them skips ahead, so a three-cluster mock is never starved by one-cluster labs.
 */
export function turns(
  queue: readonly Waiting[],
  running: Running,
  limits: CapacityLimits,
): Set<string> {
  const out = new Set<string>();
  let r = { ...running };
  for (const w of queue) {
    if (!fits(r, limits, w.clusters)) break;
    out.add(w.userId);
    r = { sessions: r.sessions + 1, clusters: r.clusters + w.clusters };
  }
  return out;
}

export type SlotDecision =
  /** Start now. */
  | { ok: true }
  /** Wait. position is 1-based when the learner is in line, null when they would join at the back. */
  | { ok: false; position: number | null; waiting: number };

/**
 * May this learner start a session with this many clusters now? Someone already in line starts when it is their
 * turn; anyone else starts only when nobody is waiting and it fits, so the line is never jumped.
 */
export function slotFor(
  userId: string,
  clusters: number,
  queue: readonly Waiting[],
  running: Running,
  limits: CapacityLimits,
): SlotDecision {
  const index = queue.findIndex((w) => w.userId === userId);
  if (index >= 0) {
    if (turns(queue, running, limits).has(userId)) return { ok: true };
    return { ok: false, position: index + 1, waiting: queue.length };
  }
  if (queue.length === 0 && fits(running, limits, clusters))
    return { ok: true };
  return { ok: false, position: null, waiting: queue.length };
}
