import "server-only";
import { ilike, or, sql } from "drizzle-orm";
import { lesson, question } from "@lfct/curriculum/db";
import { getDb } from "@/db";
import { competencyPath, getCatalog } from "./catalog";

export interface SearchResult {
  kind: "lesson" | "competency" | "question";
  title: string;
  href: string;
  context: string;
  mock?: boolean;
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Lessons, competencies and questions across certs. Token match, ranked by how many tokens hit. */
export async function search(query: string, limit = 30): Promise<SearchResult[]> {
  const tokens = query.toLowerCase().split(/[^a-z0-9.-]+/).filter((t) => t.length >= 2).slice(0, 6);
  if (tokens.length === 0) return [];
  const catalog = await getCatalog();
  const score = (text: string) => tokens.reduce((n, t) => n + (text.toLowerCase().includes(t) ? 1 : 0), 0);
  const db = getDb();
  const lessonCond = or(...tokens.flatMap((t) => [ilike(lesson.title, `%${escapeLike(t)}%`), ilike(lesson.summary, `%${escapeLike(t)}%`), ilike(lesson.body, `%${escapeLike(t)}%`)]));
  const questionCond = or(...tokens.map((t) => ilike(question.stem, `%${escapeLike(t)}%`)));
  const [lessons, questions] = await Promise.all([
    db.select({ id: lesson.id, title: lesson.title, summary: lesson.summary, body: lesson.body, refs: lesson.competencyRefs, cert: lesson.certCode, mock: lesson.mock }).from(lesson).where(lessonCond).limit(50),
    db.select({ id: question.id, stem: question.stem, refs: question.competencyRefs, cert: question.certCode, mock: question.mock }).from(question).where(sql`${questionCond} and ${question.knownIssue} is null`).limit(50),
  ]);
  const results: (SearchResult & { score: number })[] = [];
  for (const l of lessons) {
    results.push({ kind: "lesson", title: l.title, href: competencyPath(l.refs[0]!), context: `${l.cert} lesson · ${l.summary}`, mock: l.mock, score: score(`${l.title} ${l.summary}`) * 2 + score(l.body) });
  }
  for (const { cert, domain, competency } of catalog.competencies.values()) {
    const s = score(`${competency.statement} ${domain.name}`) * 2 + score(`${cert.code} ${cert.name}`);
    if (s > 0 && score(competency.statement + " " + domain.name) > 0) {
      results.push({ kind: "competency", title: competency.statement, href: competencyPath(competency.ref), context: `${cert.code} · ${domain.name}`, score: s });
    }
  }
  for (const q of questions) {
    const plain = q.stem.replace(/```[\s\S]*?```/g, "").replace(/[`*_]/g, "").trim();
    results.push({ kind: "question", title: plain.length > 140 ? `${plain.slice(0, 137)}…` : plain, href: competencyPath(q.refs[0]!), context: `${q.cert} question`, mock: q.mock, score: score(q.stem) });
  }
  return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}
