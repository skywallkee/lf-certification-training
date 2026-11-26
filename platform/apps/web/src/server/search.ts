import "server-only";
import { and, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { lab, lesson, question } from "@lfct/curriculum/db";
import { getDb } from "@/db";
import { plainText, scoreItem, snippetAround, tokenize, truncate, type SearchKind, type SearchResult } from "@/lib/search";
import { competencyPath, getCatalog } from "./catalog";

export type { SearchResult } from "@/lib/search";

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function anyToken(tokens: string[], columns: Parameters<typeof ilike>[0][]): SQL {
  return or(...tokens.flatMap((t) => columns.map((c) => ilike(c, `%${escapeLike(t)}%`))))!;
}

export interface SearchOptions {
  limit?: number;
  /** Only these kinds. */
  kinds?: SearchKind[];
  /** Only this cert code (upper case). */
  cert?: string;
}

/**
 * App-wide search over certs, competencies, lessons, questions, labs and mock exams. Token match in
 * Postgres (ILIKE, the content is small), ranked here by where and how many tokens hit. Drafts and
 * questions with a known issue are left out.
 */
export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const { limit = 50, kinds, cert } = options;
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const want = (k: SearchKind) => !kinds || kinds.length === 0 || kinds.includes(k);
  const catalog = await getCatalog();
  const db = getDb();
  const results: (SearchResult & { score: number })[] = [];

  const [lessons, questions, labs] = await Promise.all([
    want("lesson")
      ? db
          .select({ id: lesson.id, title: lesson.title, summary: lesson.summary, body: lesson.body, refs: lesson.competencyRefs, cert: lesson.certCode, mock: lesson.mock })
          .from(lesson)
          .where(and(anyToken(tokens, [lesson.title, lesson.summary, lesson.body]), eq(lesson.published, true), cert ? eq(lesson.certCode, cert) : undefined))
          .limit(100)
      : [],
    want("question")
      ? db
          .select({ id: question.id, stem: question.stem, refs: question.competencyRefs, cert: question.certCode, mock: question.mock })
          .from(question)
          .where(and(anyToken(tokens, [question.stem]), isNull(question.knownIssue), eq(question.published, true), cert ? eq(question.certCode, cert) : undefined))
          .limit(100)
      : [],
    want("lab") || want("mock")
      ? db
          .select({ id: lab.id, title: lab.title, summary: lab.summary, tasks: lab.tasks, cert: lab.certCode, kind: lab.kind, mock: lab.mock, minutes: lab.minutes })
          .from(lab)
          .where(and(eq(lab.published, true), cert ? eq(lab.certCode, cert) : undefined))
      : [],
  ]);

  if (want("cert")) {
    for (const c of catalog.certs.values()) {
      if (cert && c.code !== cert) continue;
      const s = scoreItem(tokens, { title: `${c.code} ${c.name}`, exact: c.code }, query);
      if (s > 0) {
        results.push({ kind: "cert", title: `${c.code}: ${c.name}`, href: `/certs/${c.code.toLowerCase()}`, cert: c.code, context: `${c.domains.length} domains · ${c.examStyle === "performance" ? "hands-on exam" : "multiple-choice exam"}`, score: s + 4 });
      }
    }
  }

  if (want("competency")) {
    for (const { cert: c, domain, competency } of catalog.competencies.values()) {
      if (cert && c.code !== cert) continue;
      const s = scoreItem(tokens, { title: competency.statement, secondary: domain.name }, query);
      if (s > 0) {
        results.push({ kind: "competency", title: competency.statement, href: competencyPath(competency.ref), cert: c.code, context: `${c.code} · ${domain.name}`, score: s });
      }
    }
  }

  for (const l of lessons) {
    const body = plainText(l.body);
    const inTitle = scoreItem(tokens, { title: `${l.title} ${l.summary}` }) > 0;
    results.push({
      kind: "lesson",
      title: l.title,
      href: `${competencyPath(l.refs[0]!)}#lesson-${l.id}`,
      cert: l.cert,
      context: `${l.cert} · ${l.summary}`,
      snippet: inTitle ? undefined : snippetAround(body, tokens),
      mock: l.mock,
      score: scoreItem(tokens, { title: l.title, secondary: l.summary, body }, query),
    });
  }

  for (const q of questions) {
    const plain = plainText(q.stem);
    results.push({ kind: "question", title: truncate(plain, 140), href: competencyPath(q.refs[0]!), cert: q.cert, context: `${q.cert} practice question`, mock: q.mock, score: scoreItem(tokens, { title: plain }, query) });
  }

  for (const x of labs) {
    const kind: SearchKind = x.kind === "mock" ? "mock" : "lab";
    if (!want(kind)) continue;
    const taskText = x.tasks.map((t) => `${t.title}. ${plainText(t.body)}`).join(" ");
    const s = scoreItem(tokens, { title: x.title, secondary: x.summary, body: taskText }, query);
    if (s === 0) continue;
    const inTitle = scoreItem(tokens, { title: `${x.title} ${x.summary}` }) > 0;
    results.push({
      kind,
      title: x.title,
      href: kind === "mock" ? `/mocks/${x.id}` : `/labs/${x.id}`,
      cert: x.cert,
      context: `${x.cert} · ${kind === "mock" ? "practical mock exam" : "hands-on lab"} · ${x.minutes} min`,
      snippet: inTitle ? undefined : snippetAround(taskText, tokens),
      mock: x.mock,
      score: s + 1,
    });
  }

  return results
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map(({ score: _score, ...r }) => r);
}
