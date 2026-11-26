/**
 * Readiness: per-domain mastery weighted by the official domain weights, with a confidence band.
 *
 * Each domain's mastery is the mean of a Beta posterior over "gets this domain right". The prior is
 * Beta(1, 2), slightly pessimistic, so a domain with no evidence reads about 33% rather than 50%, and a few
 * right answers cannot reach 100%. Older evidence counts less (half-life 30 days). The band is a 90%
 * normal approximation from the weighted posterior variances.
 *
 * Evidence comes from four sources, each with a weight (SOURCE_WEIGHT): a question answer counts 1, a graded
 * lab task 2 (hands-on, closer to the exam), a task in a timed mock exam 3 (exam conditions), and a finished
 * lesson a quarter of a right answer, capped at one right answer per domain (reading is not proof, so it only
 * nudges and never fails). Graded items
 * also earn evidence points (lessons earn none). Below MIN_ANSWERS points, or with graded evidence in fewer
 * than MIN_DOMAINS domains, the app shows "not enough evidence" instead of a score.
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

export type EvidenceSource = "question" | "lab" | "mock" | "lesson";

/** How much one piece of evidence moves mastery, and how many evidence points it earns toward a score. */
export const SOURCE_WEIGHT: Record<EvidenceSource, number> = { question: 1, lab: 2, mock: 3, lesson: 0.25 };
export const SOURCE_POINTS: Record<EvidenceSource, number> = { question: 1, lab: 2, mock: 3, lesson: 0 };
/** Lessons in one domain together count for at most this many right answers, however many are read. */
export const LESSON_CAP = 1;

export interface Evidence {
  domainKey: string;
  correct: boolean;
  /** Age of the evidence in days at evaluation time. */
  ageDays: number;
  /** Defaults to "question". A lesson is always counted as right. */
  source?: EvidenceSource;
}

export type SourceCounts = Record<EvidenceSource, number>;

function noCounts(): SourceCounts {
  return { question: 0, lab: 0, mock: 0, lesson: 0 };
}

export type MasteryLevel = "none" | "low" | "medium" | "mastered";

export interface DomainMastery extends DomainInput {
  /** Graded items in the domain: question answers, lab tasks and mock exam tasks (lessons are not graded). */
  answers: number;
  correct: number;
  /** Evidence points earned in the domain. */
  points: number;
  bySource: SourceCounts;
  mastery: number;
  level: MasteryLevel;
}

export interface Readiness {
  domains: DomainMastery[];
  /** Graded items across domains. */
  answers: number;
  /** Evidence points across domains (a question 1, a lab task 2, a mock exam task 3). */
  points: number;
  bySource: SourceCounts;
  domainsWithEvidence: number;
  score: number;
  low: number;
  high: number;
  sufficient: boolean;
  ready: boolean;
  /** How many more evidence points (one per question answer), and in how many more domains, before a score is shown. */
  answersNeeded: number;
  domainsNeeded: number;
}

export function masteryLevel(mastery: number, answers: number, points = answers): MasteryLevel {
  if (answers === 0) return "none";
  if (mastery >= READY_AT && points >= 5) return "mastered";
  if (mastery >= 0.5) return "medium";
  return "low";
}

export function computeReadiness(domains: DomainInput[], evidence: Evidence[]): Readiness {
  const byDomain = new Map<string, { a: number; b: number; n: number; c: number; p: number; l: number; src: SourceCounts }>();
  for (const d of domains) byDomain.set(d.key, { a: PRIOR_A, b: PRIOR_B, n: 0, c: 0, p: 0, l: 0, src: noCounts() });
  for (const e of evidence) {
    const s = byDomain.get(e.domainKey);
    if (!s) continue;
    const source = e.source ?? "question";
    const w = SOURCE_WEIGHT[source] * Math.pow(0.5, Math.max(0, e.ageDays) / HALF_LIFE_DAYS);
    s.src[source] += 1;
    if (source === "lesson") {
      s.l += w;
      continue;
    }
    if (e.correct) {
      s.a += w;
      s.c += 1;
    } else {
      s.b += w;
    }
    s.n += 1;
    s.p += SOURCE_POINTS[source];
  }
  const totalWeight = domains.reduce((sum, d) => sum + d.weight, 0) || 1;
  let score = 0;
  let variance = 0;
  const bySource = noCounts();
  const out: DomainMastery[] = domains.map((d) => {
    const s = byDomain.get(d.key)!;
    s.a += Math.min(LESSON_CAP, s.l);
    const mean = s.a / (s.a + s.b);
    const v = (s.a * s.b) / ((s.a + s.b) ** 2 * (s.a + s.b + 1));
    const w = d.weight / totalWeight;
    score += w * mean;
    variance += w * w * v;
    for (const k of Object.keys(bySource) as EvidenceSource[]) bySource[k] += s.src[k];
    return { ...d, answers: s.n, correct: s.c, points: s.p, bySource: s.src, mastery: mean, level: masteryLevel(mean, s.n, s.p) };
  });
  const answers = out.reduce((sum, d) => sum + d.answers, 0);
  const points = out.reduce((sum, d) => sum + d.points, 0);
  const domainsWithEvidence = out.filter((d) => d.answers > 0).length;
  const neededDomains = Math.min(MIN_DOMAINS, domains.length);
  const sufficient = points >= MIN_ANSWERS && domainsWithEvidence >= neededDomains;
  const sd = Math.sqrt(variance);
  return {
    domains: out,
    answers,
    points,
    bySource,
    domainsWithEvidence,
    score,
    low: Math.max(0, score - Z90 * sd),
    high: Math.min(1, score + Z90 * sd),
    sufficient,
    ready: sufficient && score >= READY_AT,
    answersNeeded: Math.max(0, MIN_ANSWERS - points),
    domainsNeeded: Math.max(0, neededDomains - domainsWithEvidence),
  };
}

/** "24 answers, 3 lab tasks and 1 mock exam task": what a score was computed from, graded items only. */
export function evidenceSummary(counts: SourceCounts): string {
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (counts.question > 0) parts.push(plural(counts.question, "answer", "answers"));
  if (counts.lab > 0) parts.push(plural(counts.lab, "lab task", "lab tasks"));
  if (counts.mock > 0) parts.push(plural(counts.mock, "mock exam task", "mock exam tasks"));
  if (parts.length === 0) return "no graded answers";
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export function pct(x: number): number {
  return Math.round(x * 100);
}
