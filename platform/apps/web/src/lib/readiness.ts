/**
 * Readiness: per-domain mastery weighted by the official domain weights, with a confidence band.
 *
 * Each domain's mastery is the mean of a Beta posterior over "answers this domain correctly". The prior is
 * Beta(1, 2), slightly pessimistic, so a domain with no evidence reads about 33% rather than 50%, and a few
 * right answers cannot reach 100%. Older answers count less (half-life 30 days). The band is a 90%
 * normal approximation from the weighted posterior variances. Below MIN_ANSWERS answers, or with evidence
 * in fewer than MIN_DOMAINS domains, the app shows "not enough evidence" instead of a score.
 */

export const PRIOR_A = 1;
export const PRIOR_B = 2;
export const HALF_LIFE_DAYS = 30;
export const MIN_ANSWERS = 20;
export const MIN_DOMAINS = 3;
export const READY_AT = 0.8;
const Z90 = 1.645;

export interface DomainInput {
  key: string;
  name: string;
  /** Official weight, percent. Weights of a cert sum to 100. */
  weight: number;
}

export interface Evidence {
  domainKey: string;
  correct: boolean;
  /** Age of the answer in days at evaluation time. */
  ageDays: number;
}

export type MasteryLevel = "none" | "low" | "medium" | "mastered";

export interface DomainMastery extends DomainInput {
  answers: number;
  correct: number;
  mastery: number;
  level: MasteryLevel;
}

export interface Readiness {
  domains: DomainMastery[];
  answers: number;
  domainsWithEvidence: number;
  score: number;
  low: number;
  high: number;
  sufficient: boolean;
  ready: boolean;
  /** How many more answers, and in how many more domains, before a score is shown. */
  answersNeeded: number;
  domainsNeeded: number;
}

export function masteryLevel(mastery: number, answers: number): MasteryLevel {
  if (answers === 0) return "none";
  if (mastery >= READY_AT && answers >= 5) return "mastered";
  if (mastery >= 0.5) return "medium";
  return "low";
}

export function computeReadiness(domains: DomainInput[], evidence: Evidence[]): Readiness {
  const byDomain = new Map<string, { a: number; b: number; n: number; c: number }>();
  for (const d of domains) byDomain.set(d.key, { a: PRIOR_A, b: PRIOR_B, n: 0, c: 0 });
  for (const e of evidence) {
    const s = byDomain.get(e.domainKey);
    if (!s) continue;
    const w = Math.pow(0.5, Math.max(0, e.ageDays) / HALF_LIFE_DAYS);
    if (e.correct) {
      s.a += w;
      s.c += 1;
    } else {
      s.b += w;
    }
    s.n += 1;
  }
  const totalWeight = domains.reduce((sum, d) => sum + d.weight, 0) || 1;
  let score = 0;
  let variance = 0;
  const out: DomainMastery[] = domains.map((d) => {
    const s = byDomain.get(d.key)!;
    const mean = s.a / (s.a + s.b);
    const v = (s.a * s.b) / ((s.a + s.b) ** 2 * (s.a + s.b + 1));
    const w = d.weight / totalWeight;
    score += w * mean;
    variance += w * w * v;
    return { ...d, answers: s.n, correct: s.c, mastery: mean, level: masteryLevel(mean, s.n) };
  });
  const answers = out.reduce((sum, d) => sum + d.answers, 0);
  const domainsWithEvidence = out.filter((d) => d.answers > 0).length;
  const neededDomains = Math.min(MIN_DOMAINS, domains.length);
  const sufficient = answers >= MIN_ANSWERS && domainsWithEvidence >= neededDomains;
  const sd = Math.sqrt(variance);
  return {
    domains: out,
    answers,
    domainsWithEvidence,
    score,
    low: Math.max(0, score - Z90 * sd),
    high: Math.min(1, score + Z90 * sd),
    sufficient,
    ready: sufficient && score >= READY_AT,
    answersNeeded: Math.max(0, MIN_ANSWERS - answers),
    domainsNeeded: Math.max(0, neededDomains - domainsWithEvidence),
  };
}

export function pct(x: number): number {
  return Math.round(x * 100);
}
