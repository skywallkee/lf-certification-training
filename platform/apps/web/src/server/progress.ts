import "server-only";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { answer, certStatus, lessonProgress, quiz, reviewItem } from "@/db/schema";
import { question } from "@lfct/curriculum/db";
import { certStatusView, isHeld, type CertStatusView, type ReportedStatus } from "@/lib/cert-status";
import { addDays, daysBetween, dateIn, type IsoDate } from "@/lib/dates";
import { computeReadiness, type Readiness } from "@/lib/readiness";
import { currentStreak } from "@/lib/streak";
import type { Catalog, CatalogCert } from "./catalog";

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

/** Readiness for one cert from every answer to questions tagged with its competencies. */
export const getReadiness = cache(async (userId: string, cert: CatalogCert, today: IsoDate): Promise<Readiness> => {
  const rows = await getDb()
    .select({ correct: answer.correct, answeredAt: answer.answeredAt, refs: question.competencyRefs })
    .from(answer)
    .innerJoin(question, eq(question.id, answer.questionId))
    .where(and(eq(answer.userId, userId), eq(answer.certCode, cert.code)));
  const prefix = `${cert.code.toLowerCase()}/`;
  const evidence = rows.flatMap((r) => {
    const ref = r.refs.find((x) => x.startsWith(prefix));
    if (!ref) return [];
    return [{ domainKey: ref.split("/")[1]!, correct: r.correct, ageDays: daysBetween(r.answeredAt.toISOString().slice(0, 10), today) }];
  });
  return computeReadiness(cert.domains.map((d) => ({ key: d.key, name: d.name, weight: d.weight })), evidence);
});

export async function getReviewDue(userId: string, today: IsoDate): Promise<{ count: number; ids: string[] }> {
  const rows = await getDb()
    .select({ id: reviewItem.questionId })
    .from(reviewItem)
    .innerJoin(question, eq(question.id, reviewItem.questionId))
    .where(and(eq(reviewItem.userId, userId), lte(reviewItem.dueOn, today)))
    .orderBy(reviewItem.dueOn, reviewItem.box);
  return { count: rows.length, ids: rows.map((r) => r.id) };
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
        label: q.kind === "review" ? "Review session" : `${q.cert ?? ""} practice quiz`.trim(),
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

/** Readiness at the end of each of the last `weeks` weeks, from the answers given up to then. */
export async function getReadinessHistory(userId: string, cert: CatalogCert, today: IsoDate, weeks = 8) {
  const rows = await getDb()
    .select({ correct: answer.correct, answeredAt: answer.answeredAt, refs: question.competencyRefs })
    .from(answer)
    .innerJoin(question, eq(question.id, answer.questionId))
    .where(and(eq(answer.userId, userId), eq(answer.certCode, cert.code)));
  const prefix = `${cert.code.toLowerCase()}/`;
  const domains = cert.domains.map((d) => ({ key: d.key, name: d.name, weight: d.weight }));
  const points: { week: IsoDate; score: number | null; answers: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = addDays(today, -7 * i);
    const evidence = rows.flatMap((r) => {
      const day = r.answeredAt.toISOString().slice(0, 10);
      const ref = r.refs.find((x) => x.startsWith(prefix));
      if (!ref || day > end) return [];
      return [{ domainKey: ref.split("/")[1]!, correct: r.correct, ageDays: daysBetween(day, end) }];
    });
    const r = computeReadiness(domains, evidence);
    points.push({ week: end, score: r.sufficient ? r.score : null, answers: r.answers });
  }
  return points;
}
