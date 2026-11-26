import { daysBetween, type IsoDate } from "./dates.ts";
import { pct, READY_AT, type Readiness } from "./readiness.ts";

/**
 * "Am I ready to book?" as a short checklist per cert, shown on the progress dashboard. Readiness alone can hide
 * a weak domain behind strong heavy ones, and for a hands-on exam a passed timed mock is the best single signal,
 * so the list has up to three checks. A cert is book-ready when every check that applies is met.
 */

/** A domain below this mastery is flagged even when the weighted score is high. */
export const DOMAIN_FLOOR = 0.5;
/** A mock exam pass older than this many days no longer counts. */
export const MOCK_FRESH_DAYS = 30;

export interface MockAttemptSummary {
  /** Exam mode only; practice attempts give feedback and are not a fair test. */
  at: IsoDate;
  score: number;
  passMark: number;
}

export interface BookingCheck {
  key: "readiness" | "domains" | "mock";
  met: boolean;
  label: string;
}

export function bookingChecks(readiness: Readiness, opts: { mockAvailable: boolean; attempts: MockAttemptSummary[]; today: IsoDate }): BookingCheck[] {
  const checks: BookingCheck[] = [];
  checks.push({
    key: "readiness",
    met: readiness.ready,
    label: readiness.sufficient
      ? `Readiness at ${Math.round(READY_AT * 100)}% or more (now ${pct(readiness.score)}%)`
      : `Readiness at ${Math.round(READY_AT * 100)}% or more (not enough evidence yet)`,
  });
  const weak = readiness.domains.filter((d) => d.answers === 0 || d.mastery < DOMAIN_FLOOR);
  checks.push({
    key: "domains",
    met: weak.length === 0,
    label:
      weak.length === 0
        ? `Every domain at ${Math.round(DOMAIN_FLOOR * 100)}% or more`
        : `Every domain at ${Math.round(DOMAIN_FLOOR * 100)}% or more (${weak.length} below: ${weak
            .slice(0, 2)
            .map((d) => d.name)
            .join(", ")}${weak.length > 2 ? "…" : ""})`,
  });
  if (opts.mockAvailable) {
    const recent = opts.attempts.filter((a) => daysBetween(a.at, opts.today) <= MOCK_FRESH_DAYS);
    const passed = recent.some((a) => a.score >= a.passMark);
    const best = recent.reduce<number | null>((m, a) => (m === null || a.score > m ? a.score : m), null);
    checks.push({
      key: "mock",
      met: passed,
      label: passed
        ? `Passed a timed mock exam in the last ${MOCK_FRESH_DAYS} days`
        : best === null
          ? `Pass a timed mock exam (none in the last ${MOCK_FRESH_DAYS} days)`
          : `Pass a timed mock exam (best in the last ${MOCK_FRESH_DAYS} days: ${best}%)`,
    });
  }
  return checks;
}

export function bookReady(checks: BookingCheck[]): boolean {
  return checks.every((c) => c.met);
}
