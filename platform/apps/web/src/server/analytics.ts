import "server-only";
import { and, eq, gte, inArray, ne, or, isNull, sql } from "drizzle-orm";
import { lab, question } from "@lfct/curriculum/db";
import { getDb } from "@/db";
import { answer, labCheckRun, labSession, user as userTable } from "@/db/schema";
import {
  activeWithin,
  domainWeakness,
  percentChange,
  questionWeakness,
  rangeStart,
  usageByLab,
  usageTotals,
  weeklyActive,
  weeklyClusterMinutes,
  type ActivityDay,
  type DomainEvidence,
  type QuestionTally,
  type RangeWeeks,
  type UsageSession,
} from "@/lib/analytics";
import { addDays, type IsoDate } from "@/lib/dates";
import { domainOf, taskEvidence } from "@/lib/evidence";
import { getCatalog } from "./catalog";

/**
 * Loads the rows behind /admin/analytics for one window and hands them to the pure functions in lib/analytics.ts.
 * Learners only: accounts with the admin role are left out everywhere. Reads are a handful of indexed range scans,
 * fine for the local stack and a cohort of hundreds; a rollup table can replace them if the cohort grows.
 */

const notAdmin = or(isNull(userTable.role), ne(userTable.role, "admin"));

export async function getAnalytics(today: IsoDate, weeks: RangeWeeks, now: Date = new Date()) {
  const db = getDb();
  const catalog = await getCatalog();
  const from = rangeStart(today, weeks);
  // Activity reaches back far enough for "active in the last 30 days" and the previous 7 days, whatever the window.
  const activityFrom = from < addDays(today, -60) ? from : addDays(today, -60);
  const since = new Date(`${from}T00:00:00Z`);

  const [activity, learners, signUps, tallies, sessions] = await Promise.all([
    db.execute<{ user_id: string; day: string }>(sql`
      select distinct t.user_id, to_char(t.at at time zone 'UTC', 'YYYY-MM-DD') as day
      from (
        select user_id, answered_at as at from answer where answered_at >= ${`${activityFrom}T00:00:00Z`}::timestamptz
        union all
        select user_id, completed_at from lesson_progress where completed_at >= ${`${activityFrom}T00:00:00Z`}::timestamptz
        union all
        select user_id, created_at from lab_session where created_at >= ${`${activityFrom}T00:00:00Z`}::timestamptz
      ) t
      join "user" u on u.id = t.user_id
      where u.role is distinct from 'admin'
    `),
    db.select({ n: sql<number>`count(*)::int` }).from(userTable).where(notAdmin),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userTable)
      .where(and(notAdmin, gte(userTable.createdAt, since))),
    db
      .select({
        questionId: answer.questionId,
        userId: answer.userId,
        certCode: answer.certCode,
        answers: sql<number>`count(*)::int`,
        correct: sql<number>`count(*) filter (where ${answer.correct})::int`,
      })
      .from(answer)
      .innerJoin(userTable, eq(userTable.id, answer.userId))
      .where(and(notAdmin, gte(answer.answeredAt, since)))
      .groupBy(answer.questionId, answer.userId, answer.certCode),
    db
      .select({
        id: labSession.id,
        userId: labSession.userId,
        labId: labSession.labId,
        certCode: labSession.certCode,
        mode: labSession.mode,
        status: labSession.status,
        createdAt: labSession.createdAt,
        readyAt: labSession.readyAt,
        endedAt: labSession.endedAt,
        expiresAt: labSession.expiresAt,
        score: labSession.score,
      })
      .from(labSession)
      .innerJoin(userTable, eq(userTable.id, labSession.userId))
      .where(and(notAdmin, gte(labSession.createdAt, since))),
  ]);

  const labIds = [...new Set(sessions.map((s) => s.labId))];
  const questionIds = [...new Set(tallies.map((t) => t.questionId))];
  const sessionIds = sessions.filter((s) => s.score !== null).map((s) => s.id);
  const [labs, questions, finals] = await Promise.all([
    labIds.length
      ? db
          .select({ id: lab.id, title: lab.title, kind: lab.kind, clusters: lab.clusters, passPercent: lab.passPercent, tasks: lab.tasks, refs: lab.competencyRefs, certCode: lab.certCode })
          .from(lab)
          .where(inArray(lab.id, labIds))
      : [],
    questionIds.length ? db.select({ id: question.id, stem: question.stem, refs: question.competencyRefs, certCode: question.certCode }).from(question).where(inArray(question.id, questionIds)) : [],
    sessionIds.length
      ? db
          .selectDistinctOn([labCheckRun.sessionId], { sessionId: labCheckRun.sessionId, results: labCheckRun.results })
          .from(labCheckRun)
          .where(and(eq(labCheckRun.kind, "final"), inArray(labCheckRun.sessionId, sessionIds)))
          .orderBy(labCheckRun.sessionId, sql`${labCheckRun.createdAt} desc`)
      : [],
  ]);
  const labsById = new Map(labs.map((l) => [l.id, l]));
  const questionsById = new Map(questions.map((q) => [q.id, q]));

  // Activity
  const days: ActivityDay[] = activity.rows.map((r) => ({ userId: r.user_id, day: r.day }));
  const inWindow = days.filter((d) => d.day >= from);
  const active7 = activeWithin(days, today, 7);
  const activePrev7 = activeWithin(days, addDays(today, -7), 7);

  // Weak domains: answers plus graded lab and mock tasks.
  const evidence: DomainEvidence[] = [];
  for (const t of tallies) {
    const q = questionsById.get(t.questionId);
    const domainKey = q ? domainOf(q.refs, t.certCode) : undefined;
    if (!domainKey) continue;
    for (let i = 0; i < t.answers; i++) evidence.push({ userId: t.userId, certCode: t.certCode, domainKey, correct: i < t.correct, source: "question" });
  }
  const sessionsById = new Map(sessions.map((s) => [s.id, s]));
  for (const f of finals) {
    const s = sessionsById.get(f.sessionId);
    const l = s ? labsById.get(s.labId) : undefined;
    if (!s || !l) continue;
    for (const e of taskEvidence(l.tasks, l.refs, s.certCode, f.results, "lab", today)) {
      evidence.push({ userId: s.userId, certCode: s.certCode, domainKey: e.domainKey, correct: e.correct, source: "task" });
    }
  }
  const domainName = (cert: string, key: string) => catalog.certs.get(cert)?.domains.find((d) => d.key === key)?.name ?? key;
  const domains = domainWeakness(evidence).map((d) => ({ ...d, domainName: domainName(d.certCode, d.domainKey) }));
  const qTallies: QuestionTally[] = tallies.map((t) => ({ questionId: t.questionId, userId: t.userId, answers: t.answers, correct: t.correct }));
  const weakQuestions = questionWeakness(qTallies).map((q) => {
    const row = questionsById.get(q.questionId);
    const d = row ? domainOf(row.refs, row.certCode) : undefined;
    return { ...q, stem: row?.stem ?? q.questionId, certCode: row?.certCode ?? "", domainName: row && d ? domainName(row.certCode, d) : "" };
  });

  // Labs and mock exams
  const usage: (UsageSession & { kind: "lab" | "mock" })[] = sessions.map((s) => {
    const l = labsById.get(s.labId);
    return { ...s, clusters: l?.clusters.length ?? 1, passPercent: l?.passPercent ?? null, kind: l?.kind === "mock" || s.mode !== "lab" ? "mock" : "lab" };
  });
  const labSessions = usage.filter((s) => s.kind === "lab");
  const mockSessions = usage.filter((s) => s.kind === "mock");
  const describe = (row: ReturnType<typeof usageByLab>[number]) => {
    const l = labsById.get(row.labId);
    return { ...row, title: l?.title ?? `${row.labId} (removed)`, certCode: l?.certCode ?? "", clusters: l?.clusters.length ?? 1 };
  };

  return {
    from,
    learners: learners[0]?.n ?? 0,
    signUps: signUps[0]?.n ?? 0,
    active7,
    active7Change: percentChange(active7, activePrev7),
    active30: activeWithin(days, today, 30),
    activeInWindow: new Set(inWindow.map((d) => d.userId)).size,
    weeklyActive: weeklyActive(inWindow, today, weeks),
    answers: tallies.reduce((n, t) => n + t.answers, 0),
    domains,
    weakQuestions,
    labs: usageByLab(labSessions, now).map(describe),
    mocks: usageByLab(mockSessions, now).map(describe),
    labTotals: usageTotals(labSessions, now),
    mockTotals: usageTotals(mockSessions, now),
    weeklyClusterMinutes: weeklyClusterMinutes(usage, today, weeks, now),
  };
}

export type Analytics = Awaited<ReturnType<typeof getAnalytics>>;
