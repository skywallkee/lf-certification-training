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
