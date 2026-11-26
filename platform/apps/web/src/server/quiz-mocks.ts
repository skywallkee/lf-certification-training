import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { drawQuestions, isCorrectChoice, scoreQuizMock, type QuizDomainScore } from "@lfct/curriculum";
import { question as questionTable, quizMock as quizMockTable } from "@lfct/curriculum/db";
import type { GradedAttempt } from "@lfct/labs";
import { getDb } from "@/db";
import { answer, quiz, reviewItem, type QuizDraftJson } from "@/db/schema";
import { nextReviewState } from "@/lib/review";
import { getCatalog, type CatalogCert } from "./catalog";
import { getProfile } from "./session";
import { learnerToday } from "./today";

/**
 * Multiple-choice mock exams (KCNA, KCSA and the other knowledge certs). An attempt is a `quiz` row with kind "mock":
 * the questions are drawn at the start, answers and flags live in `draft` while the clock runs, and grading writes
 * one `answer` row per answered question (so readiness and the review queue use them like any other answer) plus
 * the score. Nothing to boot, so no allowance: a learner can sit one as often as they like.
 */

export type QuizMockRow = typeof quizMockTable.$inferSelect;
export type QuizAttemptRow = typeof quiz.$inferSelect;

/** Saves are still accepted this long after the clock runs out, for the last answer in flight. */
export const GRACE_MS = 30_000;

export async function listQuizMocks(): Promise<QuizMockRow[]> {
  const rows = await getDb().select().from(quizMockTable).where(eq(quizMockTable.published, true));
  return rows.sort((a, b) => a.certCode.localeCompare(b.certCode) || b.minutes - a.minutes || a.title.localeCompare(b.title));
}

export async function getQuizMock(id: string): Promise<QuizMockRow | null> {
  const [row] = await getDb().select().from(quizMockTable).where(eq(quizMockTable.id, id));
  return row ?? null;
}

/** The domain key of a question in a cert: the domain of its first competency in that cert. */
export function domainOf(refs: readonly string[], cert: string): string | null {
  const prefix = `${cert.toLowerCase()}/`;
  const ref = refs.find((r) => r.startsWith(prefix));
  return ref ? (ref.split("/")[1] ?? null) : null;
}

/** Questions a mock can ask: published, without a known issue, tagged with a competency of the cert. */
async function questionPool(cert: string) {
  const rows = await getDb()
    .select({ id: questionTable.id, refs: questionTable.competencyRefs })
    .from(questionTable)
    .where(and(eq(questionTable.certCode, cert), eq(questionTable.published, true), isNull(questionTable.knownIssue)));
  return rows.flatMap((r) => {
    const domain = domainOf(r.refs, cert);
    return domain ? [{ id: r.id, domain }] : [];
  });
}

/** How many questions an attempt of this mock asks now: the bank may hold fewer than the mock wants. */
export async function plannedCount(mock: QuizMockRow): Promise<{ count: number; minutes: number }> {
  const pool = await questionPool(mock.certCode);
  const available = mock.questionIds ? mock.questionIds.filter((id) => pool.some((q) => q.id === id)).length : pool.length;
  const count = Math.min(mock.questionCount, available);
  return { count, minutes: minutesFor(mock, count) };
}

/** The timer keeps the mock's pace per question when the bank is short: 90 minutes for 60 questions, 30 for 20. */
export function minutesFor(mock: Pick<QuizMockRow, "minutes" | "questionCount">, count: number): number {
  if (count >= mock.questionCount) return mock.minutes;
  return Math.max(5, Math.round((mock.minutes * count) / mock.questionCount));
}

/** The learner's running attempt of this mock, if any (not submitted, time not up). */
export async function getRunningAttempt(userId: string, mockId: string, now = new Date()): Promise<QuizAttemptRow | null> {
  const rows = await getDb()
    .select()
    .from(quiz)
    .where(and(eq(quiz.userId, userId), eq(quiz.kind, "mock"), eq(quiz.mockId, mockId), isNull(quiz.finishedAt)))
    .orderBy(desc(quiz.createdAt))
    .limit(1);
  const row = rows[0];
  return row && row.expiresAt && row.expiresAt.getTime() + GRACE_MS > now.getTime() ? row : null;
}

/** Starts an attempt (or returns the running one). Returns null when the bank has no question for the mock. */
export async function startQuizMock(userId: string, mock: QuizMockRow, now = new Date()): Promise<string | null> {
  const running = await getRunningAttempt(userId, mock.id, now);
  if (running) return running.id;
  const [pool, catalog] = await Promise.all([questionPool(mock.certCode), getCatalog()]);
  const cert = catalog.certs.get(mock.certCode);
  const seenRows = pool.length
    ? await getDb()
        .selectDistinct({ id: answer.questionId })
        .from(answer)
        .where(and(eq(answer.userId, userId), inArray(answer.questionId, pool.map((q) => q.id))))
    : [];
  const ids = drawQuestions({
    pool,
    domains: (cert?.domains ?? []).map((d) => ({ key: d.key, weight: d.weight })),
    count: mock.questionCount,
    fixed: mock.questionIds ?? undefined,
    seen: new Set(seenRows.map((r) => r.id)),
  });
  if (ids.length === 0) return null;
  const minutes = minutesFor(mock, ids.length);
  const [row] = await getDb()
    .insert(quiz)
    .values({
      userId,
      kind: "mock",
      feedback: "end",
      certCode: mock.certCode,
      questionIds: ids,
      mockId: mock.id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + minutes * 60_000),
      passPercent: mock.passPercent,
      draft: { answers: {}, flags: [], current: 0 },
    })
    .returning({ id: quiz.id });
  return row!.id;
}

/** Keeps only answers to questions of the attempt, with option ids that exist, and flags of its questions. */
export function cleanDraft(input: QuizDraftJson, questionIds: readonly string[], options: ReadonlyMap<string, readonly string[]>): QuizDraftJson {
  const answers: Record<string, string[]> = {};
  for (const id of questionIds) {
    const picked = input.answers[id];
    if (!Array.isArray(picked)) continue;
    const valid = [...new Set(picked.map(String))].filter((o) => options.get(id)?.includes(o)).sort();
    if (valid.length) answers[id] = valid;
  }
  const flags = [...new Set(input.flags.map(String))].filter((f) => questionIds.includes(f));
  const current = Math.min(Math.max(0, Math.trunc(Number(input.current) || 0)), Math.max(0, questionIds.length - 1));
  return { answers, flags, current };
}

/**
 * Grades an attempt from its saved answers: one `answer` row per answered question, review queue updates, then the
 * score. Safe to call twice: an attempt is graded once (the update on finished_at IS NULL decides).
 */
export async function gradeAttempt(attempt: QuizAttemptRow, now = new Date()): Promise<void> {
  if (attempt.finishedAt) return;
  const db = getDb();
  const items = await db.select().from(questionTable).where(inArray(questionTable.id, attempt.questionIds));
  const byId = new Map(items.map((q) => [q.id, q]));
  const draft = attempt.draft ?? { answers: {}, flags: [], current: 0 };
  const today = learnerToday(await getProfile(attempt.userId));
  const cert = attempt.certCode ?? "";
  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(quiz)
      .set({ finishedAt: now })
      .where(and(eq(quiz.id, attempt.id), isNull(quiz.finishedAt)))
      .returning({ id: quiz.id });
    if (claimed.length === 0) return;
    const scored: { id: string; domain: string; correct: boolean }[] = [];
    for (const qid of attempt.questionIds) {
      const item = byId.get(qid);
      if (!item) continue;
      const selected = draft.answers[qid] ?? [];
      const correct = selected.length > 0 && isCorrectChoice(selected, item.options.filter((o) => o.correct).map((o) => o.id));
      scored.push({ id: qid, domain: domainOf(item.competencyRefs, cert) ?? "other", correct });
      if (selected.length === 0) continue;
      await tx.insert(answer).values({ userId: attempt.userId, quizId: attempt.id, questionId: qid, certCode: item.certCode, selected, correct, answeredAt: now });
      const [current] = await tx.select().from(reviewItem).where(and(eq(reviewItem.userId, attempt.userId), eq(reviewItem.questionId, qid)));
      const next = nextReviewState(current ? { box: current.box, dueOn: current.dueOn, lapses: current.lapses } : undefined, correct, today);
      if (next === null) {
        await tx.delete(reviewItem).where(and(eq(reviewItem.userId, attempt.userId), eq(reviewItem.questionId, qid)));
      } else if (next) {
        await tx
          .insert(reviewItem)
          .values({ userId: attempt.userId, questionId: qid, ...next })
          .onConflictDoUpdate({ target: [reviewItem.userId, reviewItem.questionId], set: { ...next, updatedAt: new Date() } });
      }
    }
    const { score } = scoreQuizMock(scored);
    await tx.update(quiz).set({ score }).where(eq(quiz.id, attempt.id));
  });
}

/** Grades the learner's attempts whose time ran out without a submit (closed tab), so history and readiness see them. */
export async function gradeExpired(userId: string, now = new Date()): Promise<void> {
  const stale = await getDb()
    .select()
    .from(quiz)
    .where(
      and(
        eq(quiz.userId, userId),
        eq(quiz.kind, "mock"),
        isNull(quiz.finishedAt),
        isNotNull(quiz.expiresAt),
        sql`${quiz.expiresAt} < ${new Date(now.getTime() - GRACE_MS)}`,
      ),
    );
  for (const attempt of stale) await gradeAttempt(attempt, now);
}

export interface QuizResult {
  score: number;
  right: number;
  total: number;
  passed: boolean;
  passMark: number;
  domains: (QuizDomainScore & { name: string })[];
}

/** The results of a graded attempt, recomputed from its questions and saved answers. */
export function resultOf(
  attempt: QuizAttemptRow,
  items: ReadonlyMap<string, { options: { id: string; correct: boolean }[]; competencyRefs: string[] }>,
  cert: CatalogCert | undefined,
): QuizResult {
  const draft = attempt.draft ?? { answers: {}, flags: [], current: 0 };
  const code = attempt.certCode ?? "";
  const scored = attempt.questionIds.flatMap((qid) => {
    const item = items.get(qid);
    if (!item) return [];
    const selected = draft.answers[qid] ?? [];
    const correct = selected.length > 0 && isCorrectChoice(selected, item.options.filter((o) => o.correct).map((o) => o.id));
    return [{ id: qid, domain: domainOf(item.competencyRefs, code) ?? "other", correct }];
  });
  const order = (cert?.domains ?? []).map((d) => d.key);
  const r = scoreQuizMock(scored, order);
  const passMark = attempt.passPercent ?? 75;
  return {
    score: attempt.score ?? r.score,
    right: r.right,
    total: r.total,
    passMark,
    passed: (attempt.score ?? r.score) >= passMark,
    domains: r.domains.map((d) => ({ ...d, name: cert?.domains.find((x) => x.key === d.domain)?.name ?? d.domain })),
  };
}

export interface QuizMockHistory {
  mock: QuizMockRow;
  graded: GradedAttempt[];
}

/** Graded attempts per multiple-choice mock, oldest first, with each attempt's score per domain. */
export async function getQuizMockHistory(userId: string): Promise<QuizMockHistory[]> {
  const db = getDb();
  await gradeExpired(userId);
  const attempts = await db
    .select()
    .from(quiz)
    .where(and(eq(quiz.userId, userId), eq(quiz.kind, "mock"), isNotNull(quiz.score)))
    .orderBy(quiz.createdAt);
  if (attempts.length === 0) return [];
  const [mocks, catalog, items] = await Promise.all([
    listQuizMocks(),
    getCatalog(),
    db
      .select({ id: questionTable.id, options: questionTable.options, competencyRefs: questionTable.competencyRefs })
      .from(questionTable)
      .where(inArray(questionTable.id, [...new Set(attempts.flatMap((a) => a.questionIds))])),
  ]);
  const byId = new Map(items.map((q) => [q.id, q]));
  const out: QuizMockHistory[] = [];
  for (const mock of mocks) {
    const graded = attempts
      .filter((a) => a.mockId === mock.id)
      .map((a) => {
        const r = resultOf(a, byId, catalog.certs.get(mock.certCode));
        return { id: a.id, at: a.createdAt, score: a.score!, mode: "exam", passMark: r.passMark, domains: r.domains.map((d) => ({ domain: d.domain, percent: d.percent })) };
      });
    if (graded.length > 0) out.push({ mock, graded });
  }
  return out;
}

export interface QuizAttemptListItem {
  id: string;
  mockId: string;
  title: string;
  startedAt: Date;
  finished: boolean;
  score: number | null;
}

/** The learner's multiple-choice mock attempts, newest first. */
export async function listQuizAttempts(userId: string, limit = 50): Promise<QuizAttemptListItem[]> {
  const db = getDb();
  const rows = await db
    .select({ id: quiz.id, mockId: quiz.mockId, createdAt: quiz.createdAt, finishedAt: quiz.finishedAt, score: quiz.score })
    .from(quiz)
    .where(and(eq(quiz.userId, userId), eq(quiz.kind, "mock")))
    .orderBy(desc(quiz.createdAt))
    .limit(limit);
  const mocks = rows.length ? await db.select({ id: quizMockTable.id, title: quizMockTable.title }).from(quizMockTable) : [];
  const titles = new Map(mocks.map((m) => [m.id, m.title]));
  return rows.map((r) => ({
    id: r.id,
    mockId: r.mockId ?? "",
    title: titles.get(r.mockId ?? "") ?? r.mockId ?? "Mock exam",
    startedAt: r.createdAt,
    finished: r.finishedAt !== null,
    score: r.score,
  }));
}
