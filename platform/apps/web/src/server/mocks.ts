import "server-only";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { mockStartBlock, monthStart, type CheckResult, type MockMode, type MockStartBlock } from "@lfct/labs";
import { lab as labTable } from "@lfct/curriculum/db";
import { getDb } from "@/db";
import { labCheckRun, labSession } from "@/db/schema";
import { env } from "@/env";
import type { Capacity, LabRow, LabUsage } from "./labs";

/** Practical mock exams, by cert then length (full first). Tasks include checks: keep them on the server. */
export async function listMocks(): Promise<LabRow[]> {
  const rows = await getDb().select().from(labTable).where(eq(labTable.kind, "mock"));
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
  mock: Pick<LabRow, "certCode">,
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
    activeSessions: capacity.active,
    maxActiveSessions: capacity.max,
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
