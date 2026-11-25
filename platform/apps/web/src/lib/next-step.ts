import type { DomainMastery } from "./readiness.ts";

/**
 * One recommended next step for the focus cert: the heaviest, weakest domain first (weight times the gap
 * to full mastery), then within it the first competency with an unfinished lesson, else one with questions.
 */

export interface StepLesson {
  id: string;
  title: string;
  minutes: number;
  competencyRefs: string[];
}

export interface StepCompetency {
  ref: string;
  statement: string;
  domainKey: string;
}

export type NextStep =
  | { kind: "pick-focus" }
  | { kind: "lesson"; cert: string; domain: DomainMastery; lesson: StepLesson; competency: StepCompetency }
  | { kind: "quiz"; cert: string; domain: DomainMastery; questions: number }
  | { kind: "thin-content"; cert: string };

export interface NextStepInput {
  cert: string | null;
  domains: DomainMastery[];
  /** Competencies of the focus cert in curriculum order. */
  competencies: StepCompetency[];
  lessons: StepLesson[];
  completedLessons: Set<string>;
  /** Question count per competency ref. */
  questionsByCompetency: Map<string, number>;
}

export function rankDomains(domains: DomainMastery[]): DomainMastery[] {
  return [...domains].sort((a, b) => b.weight * (1 - b.mastery) - a.weight * (1 - a.mastery) || b.weight - a.weight);
}

export function nextStep(input: NextStepInput): NextStep {
  if (!input.cert) return { kind: "pick-focus" };
  for (const domain of rankDomains(input.domains)) {
    const comps = input.competencies.filter((c) => c.domainKey === domain.key);
    for (const competency of comps) {
      const lesson = input.lessons.find((l) => l.competencyRefs.includes(competency.ref) && !input.completedLessons.has(l.id));
      if (lesson) return { kind: "lesson", cert: input.cert, domain, lesson, competency };
    }
    const questions = comps.reduce((n, c) => n + (input.questionsByCompetency.get(c.ref) ?? 0), 0);
    if (questions > 0) return { kind: "quiz", cert: input.cert, domain, questions };
  }
  return { kind: "thin-content", cert: input.cert };
}
