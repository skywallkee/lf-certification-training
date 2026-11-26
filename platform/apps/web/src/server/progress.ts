import "server-only";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { answer, certStatus, labCheckRun, labSession, lessonProgress, quiz, reviewItem } from "@/db/schema";
import { lab, question } from "@lfct/curriculum/db";
import { certStatusView, isHeld, type CertStatusView, type ReportedStatus } from "@/lib/cert-status";
import { addDays, dateIn, type IsoDate } from "@/lib/dates";
import { domainOf, evidenceAsOf, sessionSource, taskEvidence, type DatedEvidence } from "@/lib/evidence";
import { computeReadiness, type Readiness } from "@/lib/readiness";
import { pickSession, type QueueItem } from "@/lib/review";
import { currentStreak } from "@/lib/streak";
import { getCatalog, type Catalog, type CatalogCert } from "./catalog";

export const getReported = cache(async (userId: string): Promise<Map<string, ReportedStatus>> => {
  const rows = await getDb().select().from(certStatus).where(eq(certStatus.userId, userId));
  return new Map(rows.map((r) => [r.certCode, { state: r.state, bookedFor: r.bookedFor, passedOn: r.passedOn }]));
});

/** Certs the learner has touched: answered a question or finished a lesson. */
export const getStudied = cache(async (userId: string): Promise<Set<string>> => {
  const db = getDb();
  const [answered, lessons] = await Promise.all([
    db.selectDistinct({ cert: answer.certCode }).from(answer).where(eq(answer.userId, userId)),
    db.execute<{ cert: string }>(
      sql`select distinct l.cert_code as cert from lesson_progress p join lesson l on l.id = p.lesson_id where p.user_id = ${userId}`,
    ),
  ]);
  return new Set([...answered.map((r) => r.cert), ...lessons.rows.map((r) => r.cert)]);
});

export async function getStatusViews(
  userId: string,
  catalog: Catalog,
  today: IsoDate,
  focusCert: string | null,
): Promise<Map<string, CertStatusView>> {
  const [reported, studied] = await Promise.all([getReported(userId), getStudied(userId)]);
  const views = new Map<string, CertStatusView>();
  for (const code of catalog.certs.keys()) {
    views.set(code, certStatusView(code, reported.get(code), today, { studying: studied.has(code) || code === focusCert }));
  }
  return views;
}

export function heldCerts(views: Map<string, CertStatusView>): Set<string> {
  return new Set([...views].filter(([, v]) => isHeld(v)).map(([c]) => c));
}

/**
 * Every piece of readiness evidence for one cert, dated: answers to questions tagged with its competencies, the
 * final grading of each lab and mock exam session for the cert (one piece per task), and finished lessons.
 */
export const getEvidence = cache(async (userId: string, certCode: string): Promise<DatedEvidence[]> => {
  const db = getDb();
  const [answers, sessions, lessons, catalog] = await Promise.all([
    db
      .select({ correct: answer.correct, answeredAt: answer.answeredAt, refs: question.competencyRefs })
      .from(answer)
      .innerJoin(question, eq(question.id, answer.questionId))
      .where(and(eq(answer.userId, userId), eq(answer.certCode, certCode))),
    db
      .select({
        id: labSession.id,
        mode: labSession.mode,
        endedAt: labSession.endedAt,
        tasks: lab.tasks,
        refs: lab.competencyRefs,
        results: labCheckRun.results,
        gradedAt: labCheckRun.createdAt,
      })
      .from(labSession)
      .innerJoin(lab, eq(lab.id, labSession.labId))
      .innerJoin(labCheckRun, and(eq(labCheckRun.sessionId, labSession.id), eq(labCheckRun.kind, "final")))
      .where(and(eq(labSession.userId, userId), eq(labSession.certCode, certCode)))
      .orderBy(desc(labCheckRun.id)),
    db.select({ id: lessonProgress.lessonId, at: lessonProgress.completedAt }).from(lessonProgress).where(eq(lessonProgress.userId, userId)),
    getCatalog(),
  ]);
  const out: DatedEvidence[] = [];
  for (const r of answers) {
    const domainKey = domainOf(r.refs, certCode);
    if (domainKey) out.push({ domainKey, correct: r.correct, source: "question", day: utcDay(r.answeredAt) });
  }
  const seen = new Set<string>();
  for (const s of sessions) {
    if (seen.has(s.id)) continue; // newest final grading per session only
    seen.add(s.id);
    out.push(...taskEvidence(s.tasks, s.refs, certCode, s.results, sessionSource(s.mode), utcDay(s.endedAt ?? s.gradedAt)));
  }
  for (const l of lessons) {
    const meta = catalog.lessonsById.get(l.id);
    const domainKey = meta ? domainOf(meta.competencyRefs, certCode) : undefined;
    if (domainKey) out.push({ domainKey, correct: true, source: "lesson", day: utcDay(l.at) });
  }
  return out;
});

function utcDay(at: Date): IsoDate {
  return at.toISOString().slice(0, 10);
}

function domainInputs(cert: CatalogCert) {
  return cert.domains.map((d) => ({ key: d.key, name: d.name, weight: d.weight }));
}

/** Readiness for one cert from questions, labs, mock exams and lessons (see lib/readiness.ts for the weights). */
export const getReadiness = cache(async (userId: string, cert: CatalogCert, today: IsoDate): Promise<Readiness> => {
  const rows = await getEvidence(userId, cert.code);
  return computeReadiness(domainInputs(cert), evidenceAsOf(rows, today));
});

export interface ReviewQueueRow extends QueueItem {
  stem: string;
  competencyRefs: string[];
}

/** The learner's whole review queue, soonest first, with each question's stem and cert. */
export async function getReviewQueue(userId: string): Promise<ReviewQueueRow[]> {
  const rows = await getDb()
    .select({
      questionId: reviewItem.questionId,
      box: reviewItem.box,
      dueOn: reviewItem.dueOn,
      lapses: reviewItem.lapses,
      certCode: question.certCode,
      stem: question.stem,
      competencyRefs: question.competencyRefs,
    })
    .from(reviewItem)
    .innerJoin(question, eq(question.id, reviewItem.questionId))
    .where(eq(reviewItem.userId, userId))
    .orderBy(reviewItem.dueOn, reviewItem.box, reviewItem.questionId);
  return rows;
}

/** Questions due today or earlier, optionally for one cert, in session order (see pickSession). */
export async function getReviewDue(userId: string, today: IsoDate, certCode?: string): Promise<{ count: number; ids: string[] }> {
  const rows = await getDb()
    .select({ questionId: reviewItem.questionId, box: reviewItem.box, dueOn: reviewItem.dueOn, lapses: reviewItem.lapses, certCode: question.certCode })
    .from(reviewItem)
    .innerJoin(question, eq(question.id, reviewItem.questionId))
    .where(and(eq(reviewItem.userId, userId), lte(reviewItem.dueOn, today), certCode ? eq(question.certCode, certCode) : undefined));
  return { count: rows.length, ids: pickSession(rows, rows.length).map((r) => r.questionId) };
}

/**
 * Questions the learner once missed that have since left the queue (answered right at every interval). Counted
 * from the answers, so nothing extra is stored.
 */
export async function getReviewCleared(userId: string): Promise<number> {
  const res = await getDb().execute<{ n: number }>(sql`
    select count(distinct a.question_id)::int as n from answer a
    where a.user_id = ${userId} and not a.correct
      and not exists (select 1 from review_item r where r.user_id = a.user_id and r.question_id = a.question_id)`);
  return res.rows[0]?.n ?? 0;
}

export async function getReviewUpcoming(userId: string, today: IsoDate): Promise<{ dueOn: string; count: number }[]> {
  const rows = await getDb()
    .select({ dueOn: reviewItem.dueOn, count: count() })
    .from(reviewItem)
    .innerJoin(question, eq(question.id, reviewItem.questionId))
    .where(and(eq(reviewItem.userId, userId), gte(reviewItem.dueOn, addDays(today, 1)), lte(reviewItem.dueOn, addDays(today, 7))))
    .groupBy(reviewItem.dueOn)
    .orderBy(reviewItem.dueOn);
  return rows;
}

export async function getCompletedLessons(userId: string): Promise<Set<string>> {
  const rows = await getDb().select({ id: lessonProgress.lessonId }).from(lessonProgress).where(eq(lessonProgress.userId, userId));
  return new Set(rows.map((r) => r.id));
}

export async function getStreak(userId: string, timeZone: string, today: IsoDate): Promise<number> {
  const since = new Date(Date.now() - 400 * 86_400_000);
  const db = getDb();
  const [a, l] = await Promise.all([
    db.select({ at: answer.answeredAt }).from(answer).where(and(eq(answer.userId, userId), gte(answer.answeredAt, since))),
    db.select({ at: lessonProgress.completedAt }).from(lessonProgress).where(and(eq(lessonProgress.userId, userId), gte(lessonProgress.completedAt, since))),
  ]);
  return currentStreak([...a, ...l].map((r) => dateIn(timeZone, r.at)), today);
}

export interface ActivityItem {
  kind: "quiz" | "lesson";
  at: Date;
  label: string;
  href: string;
  detail: string;
}

export async function getRecentActivity(userId: string, catalog: Catalog, limit = 5): Promise<ActivityItem[]> {
  const db = getDb();
  const [quizzes, lessons] = await Promise.all([
    db
      .select({
        id: quiz.id,
        kind: quiz.kind,
        cert: quiz.certCode,
        finishedAt: quiz.finishedAt,
        createdAt: quiz.createdAt,
        total: sql<number>`(select count(*)::int from answer a where a.quiz_id = "quiz"."id")`,
        right: sql<number>`(select count(*)::int from answer a where a.quiz_id = "quiz"."id" and a.correct)`,
      })
      .from(quiz)
      .where(eq(quiz.userId, userId))
      .orderBy(desc(quiz.createdAt))
      .limit(limit),
    db
      .select()
      .from(lessonProgress)
      .where(eq(lessonProgress.userId, userId))
      .orderBy(desc(lessonProgress.completedAt))
      .limit(limit),
  ]);
  const items: ActivityItem[] = [
    ...quizzes
      .filter((q) => q.total > 0)
      .map((q) => ({
        kind: "quiz" as const,
        at: q.finishedAt ?? q.createdAt,
        label: q.kind === "review" ? (q.cert ? `${q.cert} review session` : "Review session") : `${q.cert ?? ""} practice quiz`.trim(),
        href: `/quiz/${q.id}`,
        detail: `${q.right} of ${q.total} right`,
      })),
    ...lessons.flatMap((l) => {
      const lesson = catalog.lessonsById.get(l.lessonId);
      if (!lesson) return [];
      const first = lesson.competencyRefs[0]!;
      const [c, d, k] = first.split("/");
      return [{ kind: "lesson" as const, at: l.completedAt, label: lesson.title, href: `/certs/${c}/domains/${d}/competencies/${k}`, detail: "Lesson done" }];
    }),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** Readiness at the end of each of the last `weeks` weeks, from the evidence up to then. */
export async function getReadinessHistory(userId: string, cert: CatalogCert, today: IsoDate, weeks = 8) {
  const rows = await getEvidence(userId, cert.code);
  const domains = domainInputs(cert);
  const points: { week: IsoDate; score: number | null; answers: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = addDays(today, -7 * i);
    const r = computeReadiness(domains, evidenceAsOf(rows, end));
    points.push({ week: end, score: r.sufficient ? r.score : null, answers: r.answers });
  }
  return points;
}
