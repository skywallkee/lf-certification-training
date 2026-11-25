import { addDays, type IsoDate } from "./dates.ts";

/**
 * Current streak of study days: consecutive days with any study activity, ending today, or ending
 * yesterday if the learner has not studied yet today (the streak is still alive until midnight).
 */
export function currentStreak(studyDays: Iterable<IsoDate>, today: IsoDate): number {
  const days = new Set(studyDays);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
