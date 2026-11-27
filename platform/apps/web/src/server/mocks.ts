import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import { domainScores, mockStartBlock, monthStart, type CheckResult, type GradedAttempt, type MockMode, type MockStartBlock } from "@lfct/labs";
import { lab as labTable } from "@lfct/curriculum/db";
import { getDb } from "@/db";
import { labCheckRun, labSession } from "@/db/schema";
import { env } from "@/env";
import { slotForLab, type Capacity, type LabRow, type LabUsage } from "./labs";

/** Published practical mock exams, by cert then length (full first). Tasks include checks: keep them on the server. */
export async function listMocks(): Promise<LabRow[]> {
  const rows = await getDb().select().from(labTable).where(and(eq(labTable.kind, "mock"), eq(labTable.published, true)));
  return rows.sort((a, b) => a.certCode.localeCompare(b.certCode) || b.minutes - a.minutes || a.title.localeCompare(b.title));
}

export async function getMock(id: string): Promise<LabRow | null> {
  const [row] = await getDb()
    .select()
    .from(labTable)
    .where(and(eq(labTable.id, id), eq(labTable.kind, "mock")));
  return row ?? null;
}

export function mockAllowance(mode: MockMode): number {
  return mode === "exam" ? env.mocks.examsPerMonth : env.mocks.practicePerMonth;
}

/** Attempts per cert and mode this month that count: the ones the learner started (pressed Start). */
export type MockAttemptsUsed = Map<string, Record<MockMode, number>>;

export async function getMockAttemptsUsed(userId: string, now = new Date()): Promise<MockAttemptsUsed> {
  const rows = await getDb()
    .select({ certCode: labSession.certCode, mode: labSession.mode })
    .from(labSession)
    .where(and(eq(labSession.userId, userId), isNotNull(labSession.startedAt), gte(labSession.startedAt, monthStart(now))));
  const used: MockAttemptsUsed = new Map();
  for (const r of rows) {
    if (r.mode === "lab") continue;
    const entry = used.get(r.certCode) ?? { exam: 0, practice: 0 };
    entry[r.mode] += 1;
    used.set(r.certCode, entry);
  }
  return used;
}

export function usedFor(used: MockAttemptsUsed, cert: string, mode: MockMode): number {
  return used.get(cert)?.[mode] ?? 0;
}

/** Why this learner cannot start this mock in this mode now, or null. */
export function mockBlockFor(
  mock: Pick<LabRow, "certCode" | "clusters">,
  mode: MockMode,
  used: MockAttemptsUsed,
  usage: LabUsage,
  capacity: Capacity,
  now = new Date(),
): MockStartBlock | null {
  return mockStartBlock({
    used: usedFor(used, mock.certCode, mode),
    allowed: mockAllowance(mode),
    activeSessionId: usage.active?.id ?? null,
    slot: slotForLab(usage.userId, mock, capacity),
    controllerUp: capacity.controllerUp,
    now,
  });
}

/** The domain names of a cert, by key, for the score per domain. */
export function domainName(catalogCert: { domains: { key: string; name: string }[] } | undefined, key: string): string {
  return catalogCert?.domains.find((d) => d.key === key)?.name ?? key;
}

/** Practice mode: each Check run grades one task, so the newest run per task is that task's current state. */
export async function getLastChecksPerTask(sessionId: string): Promise<CheckResult[]> {
  const runs = await getDb()
    .select()
    .from(labCheckRun)
    .where(and(eq(labCheckRun.sessionId, sessionId), eq(labCheckRun.kind, "check")))
    .orderBy(desc(labCheckRun.createdAt), desc(labCheckRun.id));
  const seen = new Set<string>();
  const out: CheckResult[] = [];
  for (const run of runs) {
    const taskId = run.results[0]?.taskId;
    if (!taskId || seen.has(taskId)) continue;
    seen.add(taskId);
    out.push(...run.results.map(({ detail: _d, ...r }) => r));
  }
  return out;
}

export interface MockHistory {
  mock: LabRow;
  /** Graded attempts (started and scored), oldest first, with their score per domain. */
  graded: GradedAttempt[];
}

/**
 * Every graded attempt of the learner, grouped by mock exam, with each attempt's score per domain computed from
 * its final grading. Mocks the learner never finished an attempt of are left out.
 */
export async function getMockHistory(userId: string): Promise<MockHistory[]> {
  const db = getDb();
  const sessions = await db
    .select()
    .from(labSession)
    .where(and(eq(labSession.userId, userId), ne(labSession.mode, "lab"), isNotNull(labSession.startedAt), isNotNull(labSession.score)))
    .orderBy(labSession.startedAt);
  if (sessions.length === 0) return [];
  const [mocks, finals] = await Promise.all([
    listMocks(),
    db
      .select({ sessionId: labCheckRun.sessionId, results: labCheckRun.results, id: labCheckRun.id })
      .from(labCheckRun)
      .where(and(inArray(labCheckRun.sessionId, sessions.map((s) => s.id)), eq(labCheckRun.kind, "final")))
      .orderBy(labCheckRun.id),
  ]);
  const finalBySession = new Map(finals.map((f) => [f.sessionId, f.results]));
  const out: MockHistory[] = [];
  for (const mock of mocks) {
    const graded = sessions
      .filter((s) => s.labId === mock.id)
      .map((s) => ({
        id: s.id,
        at: s.startedAt!,
        score: s.score!,
        mode: s.mode,
        passMark: mock.passPercent ?? 66,
        domains: domainScores(mock.tasks, finalBySession.get(s.id) ?? []).map((d) => ({ domain: d.domain, percent: d.percent })),
      }));
    if (graded.length > 0) out.push({ mock, graded });
  }
  return out;
}
