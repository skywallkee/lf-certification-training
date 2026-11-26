import "server-only";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { ACTIVE_STATUSES, minutesUsed, monthStart, nextMonthStart, startBlock, type StartBlock } from "@lfct/labs";
import { lab as labTable } from "@lfct/curriculum/db";
import { getDb } from "@/db";
import { labCheckRun, labHintUse, labSession } from "@/db/schema";
import { env } from "@/env";

export type LabRow = typeof labTable.$inferSelect;
export type LabSessionRow = typeof labSession.$inferSelect;

/** Every published lab (not the mock exams), by cert then title. Tasks include checks: keep them on the server. */
export async function listLabs(): Promise<LabRow[]> {
  const rows = await getDb().select().from(labTable).where(and(eq(labTable.kind, "lab"), eq(labTable.published, true)));
  return rows.sort((a, b) => a.certCode.localeCompare(b.certCode) || a.title.localeCompare(b.title));
}

/** Drafts (unpublished labs and mock exams) are open only to admins, who try them before publishing. */
export function canOpen(lab: Pick<LabRow, "published">, user: { role: string }): boolean {
  return lab.published || user.role === "admin";
}

export async function getLab(id: string): Promise<LabRow | null> {
  const [row] = await getDb().select().from(labTable).where(eq(labTable.id, id));
  return row ?? null;
}

/** Labs tagged with a competency, for the competency page. */
export async function labsForCompetency(ref: string): Promise<Pick<LabRow, "id" | "title" | "minutes" | "tier" | "mock">[]> {
  const rows = await getDb()
    .select({ id: labTable.id, title: labTable.title, minutes: labTable.minutes, tier: labTable.tier, mock: labTable.mock, refs: labTable.competencyRefs })
    .from(labTable)
    .where(and(eq(labTable.kind, "lab"), eq(labTable.published, true)));
  return rows.filter((r) => r.refs.includes(ref));
}

export interface LabUsage {
  minutesUsed: number;
  monthlyMinutes: number;
  minutesLeft: number;
  resetsOn: Date;
  active: LabSessionRow | null;
}

/** The learner's allowance this month and their active session, if any. */
export async function getUsage(userId: string, now = new Date()): Promise<LabUsage> {
  const db = getDb();
  const rows = await db
    .select()
    .from(labSession)
    .where(and(eq(labSession.userId, userId), or(gte(labSession.createdAt, monthStart(now)), isNull(labSession.endedAt))));
  // Mock exams have their own allowance in attempts (server/mocks.ts) and do not use lab minutes.
  const used = minutesUsed(
    rows.filter((r) => r.mode === "lab"),
    now,
  );
  const monthly = env.labs.monthlyMinutes;
  const active = rows.find((r) => (ACTIVE_STATUSES as readonly string[]).includes(r.status)) ?? null;
  return { minutesUsed: used, monthlyMinutes: monthly, minutesLeft: Math.max(0, monthly - used), resetsOn: nextMonthStart(now), active };
}

/** The learner's running lab or mock attempt with its title, for the banner on every page; null if none. */
export async function getActiveSession(userId: string): Promise<import("@/components/labs/active-session-banner").ActiveSessionInfo | null> {
  const [row] = await getDb()
    .select({
      id: labSession.id,
      mode: labSession.mode,
      status: labSession.status,
      startedAt: labSession.startedAt,
      expiresAt: labSession.expiresAt,
      title: labTable.title,
      labId: labSession.labId,
    })
    .from(labSession)
    .leftJoin(labTable, eq(labTable.id, labSession.labId))
    .where(and(eq(labSession.userId, userId), inArray(labSession.status, [...ACTIVE_STATUSES])))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    title: row.title ?? row.labId,
    startedAt: row.startedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    now: new Date().toISOString(),
  };
}

export interface Capacity {
  provider: string;
  active: number;
  max: number;
  controllerUp: boolean;
}

export async function getCapacity(): Promise<Capacity> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(labSession)
    .where(inArray(labSession.status, [...ACTIVE_STATUSES]));
  return { provider: env.labs.provider, active: row?.n ?? 0, max: env.labs.maxActiveSessions, controllerUp: await controllerHealthy() };
}

/** Why this learner cannot start this lab now, or null. */
export function blockFor(lab: Pick<LabRow, "minutes">, usage: LabUsage, capacity: Capacity, now = new Date()): StartBlock | null {
  if (!capacity.controllerUp) return { reason: "controller-down" };
  return startBlock({
    labMinutes: lab.minutes,
    minutesUsed: usage.minutesUsed,
    monthlyMinutes: usage.monthlyMinutes,
    activeSessionId: usage.active?.id ?? null,
    activeSessions: capacity.active,
    maxActiveSessions: capacity.max,
    now,
  });
}

export async function getSession(id: string, userId: string): Promise<LabSessionRow | null> {
  const [row] = await getDb()
    .select()
    .from(labSession)
    .where(and(eq(labSession.id, id), eq(labSession.userId, userId)));
  return row ?? null;
}

export async function getLastCheck(sessionId: string, kind?: "check" | "final") {
  const [row] = await getDb()
    .select()
    .from(labCheckRun)
    .where(kind ? and(eq(labCheckRun.sessionId, sessionId), eq(labCheckRun.kind, kind)) : eq(labCheckRun.sessionId, sessionId))
    .orderBy(desc(labCheckRun.createdAt), desc(labCheckRun.id))
    .limit(1);
  return row ?? null;
}

export async function getHintUses(sessionId: string) {
  return getDb().select().from(labHintUse).where(eq(labHintUse.sessionId, sessionId));
}

export async function getHistory(userId: string, mode: "lab" | "mock" = "lab") {
  return getDb()
    .select()
    .from(labSession)
    .where(and(eq(labSession.userId, userId), mode === "lab" ? eq(labSession.mode, "lab") : ne(labSession.mode, "lab")))
    .orderBy(desc(labSession.createdAt))
    .limit(100);
}

/** Calls the lab controller's internal API. Throws ControllerError with the controller's message. */
export async function callController<T>(path: string, init: { method?: string; timeoutMs?: number } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.labs.controllerUrl}${path}`, {
      method: init.method ?? "POST",
      headers: { authorization: `Bearer ${env.labs.controllerSecret}` },
      signal: AbortSignal.timeout(init.timeoutMs ?? 120_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new ControllerError(`The lab controller is not reachable (${(err as Error).message}).`, 503);
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ControllerError(body.error ?? `The lab controller answered ${res.status}.`, res.status);
  return body;
}

export class ControllerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function controllerHealthy(): Promise<boolean> {
  if (!env.labs.enabled) return false;
  try {
    const res = await fetch(`${env.labs.controllerUrl}/health`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Typical boot time per lab on this machine: the median seconds from request to ready over the last ten boots
 * of each lab (any learner), so the start button tells the truth about this laptop. Labs not run yet are absent.
 */
export async function getBootTimes(): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({ labId: labSession.labId, createdAt: labSession.createdAt, readyAt: labSession.readyAt })
    .from(labSession)
    .where(isNotNull(labSession.readyAt))
    .orderBy(desc(labSession.readyAt))
    .limit(500);
  const byLab = new Map<string, number[]>();
  for (const r of rows) {
    const list = byLab.get(r.labId) ?? [];
    if (list.length < 10) list.push((r.readyAt!.getTime() - r.createdAt.getTime()) / 1000);
    byLab.set(r.labId, list);
  }
  return new Map([...byLab].map(([id, list]) => [id, Math.round(median(list))]));
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** "Usually ready in about 20 s" from real boots here, else a rough guess by tier. */
export function bootEstimate(tier: number, typicalSeconds?: number): string {
  if (typicalSeconds !== undefined) {
    return typicalSeconds < 90 ? `Usually ready in about ${Math.max(5, Math.round(typicalSeconds / 5) * 5)} s` : `Usually ready in about ${Math.round(typicalSeconds / 60)} min`;
  }
  return tier === 1 ? "About 1 minute to start" : "About 3 minutes to start";
}
