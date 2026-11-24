import "server-only";
import { todayIn } from "@/lib/dates";

/** The learner's calendar date, in their profile's time zone. */
export function learnerToday(profile: { timeZone: string } | null | undefined): string {
  return todayIn(profile?.timeZone ?? "UTC");
}
