/**
 * Multiple-choice mock exams: drawing the questions of an attempt and scoring it. Pure functions, no Node or
 * database imports, so the web app and the tests share them.
 */

export interface PoolQuestion {
  id: string;
  /** The question's domain key in the mock's cert (from its first competency). */
  domain: string;
}

export interface DomainWeight {
  key: string;
  weight: number;
}

/**
 * How many questions each domain gets: `count` split by exam weight with the largest-remainder method, capped at
 * what each domain has in the pool. Seats a domain cannot fill go to the domains that still have questions, by
 * weight again. Returns domain key → count; the total is min(count, pool size).
 */
export function domainQuota(domains: readonly DomainWeight[], available: ReadonlyMap<string, number>, count: number): Map<string, number> {
  const quota = new Map(domains.map((d) => [d.key, 0]));
  let left = Math.min(count, domains.reduce((n, d) => n + (available.get(d.key) ?? 0), 0));
  while (left > 0) {
    const open = domains.filter((d) => (available.get(d.key) ?? 0) > quota.get(d.key)!);
    const total = open.reduce((n, d) => n + d.weight, 0);
    if (open.length === 0 || total <= 0) break;
    const shares = open.map((d) => {
      const exact = (left * d.weight) / total;
      const room = (available.get(d.key) ?? 0) - quota.get(d.key)!;
      return { d, whole: Math.min(Math.floor(exact), room), rest: exact - Math.floor(exact), room };
    });
    let given = shares.reduce((n, s) => n + s.whole, 0);
    for (const s of shares) quota.set(s.d.key, quota.get(s.d.key)! + s.whole);
    // Largest remainders take the seats the whole parts left over (ties to the heavier domain, then the first).
    const byRest = shares
      .filter((s) => s.whole < s.room)
      .sort((a, b) => b.rest - a.rest || b.d.weight - a.d.weight);
    for (const s of byRest) {
      if (given >= left) break;
      quota.set(s.d.key, quota.get(s.d.key)! + 1);
      given += 1;
    }
    if (given === 0) break;
    left -= given;
  }
  return quota;
}

/** Fisher–Yates shuffle with an injectable random source (tests pass a seeded one). */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The question ids of a new attempt. With a fixed list: `count` of them, shuffled. Otherwise `count` drawn from the
 * pool by domain weight (see domainQuota), preferring questions the learner has not seen, then shuffled so the
 * domains are mixed as in the real exam.
 */
export function drawQuestions(opts: {
  pool: readonly PoolQuestion[];
  domains: readonly DomainWeight[];
  count: number;
  fixed?: readonly string[];
  /** Question ids the learner answered before: drawn last within their domain. */
  seen?: ReadonlySet<string>;
  random?: () => number;
}): string[] {
  const random = opts.random ?? Math.random;
  if (opts.fixed) {
    const known = new Set(opts.pool.map((q) => q.id));
    return shuffle(opts.fixed.filter((id) => known.has(id)), random).slice(0, opts.count);
  }
  const byDomain = new Map<string, PoolQuestion[]>();
  for (const q of opts.pool) byDomain.set(q.domain, [...(byDomain.get(q.domain) ?? []), q]);
  const available = new Map([...byDomain].map(([k, v]) => [k, v.length]));
  const quota = domainQuota(opts.domains, available, opts.count);
  const picked: string[] = [];
  for (const [key, n] of quota) {
    const list = shuffle(byDomain.get(key) ?? [], random);
    const fresh = list.filter((q) => !opts.seen?.has(q.id));
    const old = list.filter((q) => opts.seen?.has(q.id));
    picked.push(...[...fresh, ...old].slice(0, n).map((q) => q.id));
  }
  return shuffle(picked, random);
}

/** True when the selected options are exactly the correct ones. */
export function isCorrectChoice(selected: readonly string[], correctIds: readonly string[]): boolean {
  const a = [...new Set(selected)].sort();
  const b = [...new Set(correctIds)].sort();
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export interface ScoredQuestion {
  id: string;
  domain: string;
  correct: boolean;
}

export interface QuizDomainScore {
  domain: string;
  right: number;
  total: number;
  percent: number;
}

/** Score in whole percent (every question counts the same, unanswered ones as wrong) and the score per domain. */
export function scoreQuizMock(questions: readonly ScoredQuestion[], domainOrder: readonly string[] = []): { score: number; right: number; total: number; domains: QuizDomainScore[] } {
  const right = questions.filter((q) => q.correct).length;
  const total = questions.length;
  const byDomain = new Map<string, { right: number; total: number }>();
  for (const q of questions) {
    const d = byDomain.get(q.domain) ?? { right: 0, total: 0 };
    d.total += 1;
    if (q.correct) d.right += 1;
    byDomain.set(q.domain, d);
  }
  const rank = (k: string) => {
    const i = domainOrder.indexOf(k);
    return i === -1 ? domainOrder.length : i;
  };
  const domains = [...byDomain]
    .map(([domain, d]) => ({ domain, ...d, percent: Math.round((d.right / d.total) * 100) }))
    .sort((a, b) => rank(a.domain) - rank(b.domain) || a.domain.localeCompare(b.domain));
  return { score: total === 0 ? 0 : Math.round((right / total) * 100), right, total, domains };
}
