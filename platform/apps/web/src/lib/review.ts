import { addDays, type IsoDate } from "./dates.ts";

/**
 * Spaced review, Leitner style. A missed question enters box 0 and is due the next day. Each right answer
 * moves it up a box with a longer interval; a right answer in the last box retires it from the queue.
 * A wrong answer sends it back to box 0. Questions answered right the first time never enter the queue.
 */
export const INTERVAL_DAYS = [1, 2, 4, 8, 16] as const;
export const LAST_BOX = INTERVAL_DAYS.length - 1;

export interface ReviewState {
  box: number;
  dueOn: IsoDate;
  lapses: number;
}

/** The new state after an answer: a state to store, null to delete the item, or undefined for no change. */
export function nextReviewState(current: ReviewState | undefined, correct: boolean, today: IsoDate): ReviewState | null | undefined {
  if (!correct) {
    return { box: 0, dueOn: addDays(today, INTERVAL_DAYS[0]), lapses: (current?.lapses ?? 0) + 1 };
  }
  if (!current) return undefined;
  if (current.box >= LAST_BOX) return null;
  const box = current.box + 1;
  return { box, dueOn: addDays(today, INTERVAL_DAYS[box]!), lapses: current.lapses };
}

export function isDue(state: ReviewState, today: IsoDate): boolean {
  return state.dueOn <= today;
}

/** Rough time to work through a queue: about 45 seconds a question. */
export function reviewMinutes(count: number): number {
  return Math.max(1, Math.round((count * 45) / 60));
}

/** A question missed this many times or more is a "hard" one: the review page suggests reading its lesson again. */
export const HARD_AFTER_LAPSES = 3;

export function isHard(state: Pick<ReviewState, "lapses">): boolean {
  return state.lapses >= HARD_AFTER_LAPSES;
}

/** "Step 2 of 5": how far a question is through the intervals before it leaves the queue. */
export function stepLabel(box: number): string {
  return `Step ${Math.min(box, LAST_BOX) + 1} of ${INTERVAL_DAYS.length}`;
}

export interface QueueItem extends ReviewState {
  questionId: string;
  certCode: string;
}

/**
 * The questions for one review session: the most overdue first, then the lowest box (least learned), then
 * interleaved across certs so a session does not run through one cert in a block. Mixing topics is harder in
 * the moment but sticks better, and it mirrors exam days where questions jump between domains.
 */
export function pickSession<T extends QueueItem>(due: readonly T[], limit = 20): T[] {
  const sorted = [...due].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.box - b.box || a.questionId.localeCompare(b.questionId));
  const chosen = sorted.slice(0, limit);
  const byCert = new Map<string, T[]>();
  for (const item of chosen) byCert.set(item.certCode, [...(byCert.get(item.certCode) ?? []), item]);
  const lanes = [...byCert.values()];
  const out: T[] = [];
  for (let i = 0; out.length < chosen.length; i++) {
    for (const lane of lanes) if (lane[i]) out.push(lane[i]!);
  }
  return out;
}
