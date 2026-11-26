/**
 * Score trends over a learner's graded mock attempts (and lab runs): headline numbers and each domain's path,
 * for the history page and the results page's "compared with last time". No Node imports.
 */
import type { DomainScore } from "./mock.ts";

export interface GradedAttempt {
  id: string;
  /** When the attempt started (mock) or the session was created (lab). */
  at: Date;
  score: number;
  mode: string;
  passMark: number;
  domains?: Pick<DomainScore, "domain" | "percent">[];
}

export interface TrendSummary {
  attempts: number;
  latest: number | null;
  previous: number | null;
  /** Latest minus previous, in points; null with fewer than two attempts. */
  change: number | null;
  best: number | null;
  average: number | null;
  passed: number;
}

/** Headline numbers; attempts in any order. */
export function trendSummary(attempts: GradedAttempt[]): TrendSummary {
  const sorted = [...attempts].sort((a, b) => a.at.getTime() - b.at.getTime());
  const scores = sorted.map((a) => a.score);
  const latest = scores.at(-1) ?? null;
  const previous = scores.length > 1 ? scores.at(-2)! : null;
  return {
    attempts: scores.length,
    latest,
    previous,
    change: latest !== null && previous !== null ? latest - previous : null,
    best: scores.length ? Math.max(...scores) : null,
    average: scores.length ? Math.round(scores.reduce((n, s) => n + s, 0) / scores.length) : null,
    passed: sorted.filter((a) => a.score >= a.passMark).length,
  };
}

export interface DomainTrend {
  domain: string;
  /** Percent per attempt, oldest first; null where an attempt had no task in the domain. */
  percents: (number | null)[];
  first: number | null;
  latest: number | null;
  change: number | null;
}

/** Each domain's percent across the attempts (oldest first), weakest latest score first. */
export function domainTrends(attempts: GradedAttempt[]): DomainTrend[] {
  const sorted = [...attempts].sort((a, b) => a.at.getTime() - b.at.getTime());
  const names = [...new Set(sorted.flatMap((a) => (a.domains ?? []).map((d) => d.domain)))];
  return names
    .map((domain) => {
      const percents = sorted.map((a) => a.domains?.find((d) => d.domain === domain)?.percent ?? null);
      const known = percents.filter((p): p is number => p !== null);
      const first = known[0] ?? null;
      const latest = known.at(-1) ?? null;
      return { domain, percents, first, latest, change: known.length > 1 ? latest! - first! : null };
    })
    .sort((a, b) => (a.latest ?? 101) - (b.latest ?? 101) || a.domain.localeCompare(b.domain));
}
