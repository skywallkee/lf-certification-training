import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  ACTIVE_STATUSES,
  minutesUsed,
  monthStart,
  nextMonthStart,
  QUEUE_STALE_SECONDS,
  slotFor,
  startBlock,
  type CapacityLimits,
  type Running,
  type SlotDecision,
  type StartBlock,
  type Waiting,
} from "@lfct/labs";
import { lab as labTable } from "@lfct/curriculum/db";
import { getDb } from "@/db";
import { labCheckRun, labHintUse, labQueue, labSession } from "@/db/schema";
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
  userId: string;
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
  return { userId, minutesUsed: used, monthlyMinutes: monthly, minutesLeft: Math.max(0, monthly - used), resetsOn: nextMonthStart(now), active };
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

export interface Capacity extends Running, CapacityLimits {
  provider: string;
  /** The waiting line, first in line first (entries whose page stopped checking in are left out). */
  queue: (Waiting & { labId: string; mode: string })[];
  controllerUp: boolean;
}

type DbOrTx = Pick<ReturnType<typeof getDb>, "select" | "delete">;

/** Sessions and clusters running now: each active session counts its lab's clusters (a mock may boot three). */
export async function getRunning(db: DbOrTx = getDb()): Promise<Running> {
  const [row] = await db
    .select({
      sessions: sql<number>`count(*)::int`,
      clusters: sql<number>`coalesce(sum(greatest(coalesce(cardinality(${labTable.clusters}), 1), 1)), 0)::int`,
    })
    .from(labSession)
    .leftJoin(labTable, eq(labTable.id, labSession.labId))
    .where(inArray(labSession.status, [...ACTIVE_STATUSES]));
  return { sessions: row?.sessions ?? 0, clusters: row?.clusters ?? 0 };
}

/** The live waiting line. Entries not refreshed for QUEUE_STALE_SECONDS are removed first. */
export async function getQueue(db: DbOrTx = getDb()): Promise<Capacity["queue"]> {
  await db.delete(labQueue).where(lt(labQueue.seenAt, sql`now() - make_interval(secs => ${QUEUE_STALE_SECONDS})`));
  return db
    .select({ userId: labQueue.userId, clusters: labQueue.clusters, labId: labQueue.labId, mode: labQueue.mode })
    .from(labQueue)
    .orderBy(asc(labQueue.createdAt), asc(labQueue.userId));
}

export function capacityLimits(): CapacityLimits {
  return { maxSessions: env.labs.maxActiveSessions, maxClusters: env.labs.maxClusters };
}

export async function getCapacity(): Promise<Capacity> {
  const [running, queue, controllerUp] = await Promise.all([getRunning(), getQueue(), controllerHealthy()]);
  return { provider: env.labs.provider, ...running, ...capacityLimits(), queue, controllerUp };
}

/** Clusters a lab or mock boots (one per kubectl context). */
export function clustersOf(lab: Pick<LabRow, "clusters">): number {
  return Math.max(1, lab.clusters.length);
}

/** Room for this learner to start this lab now, given the line. */
export function slotForLab(userId: string, lab: Pick<LabRow, "clusters">, capacity: Capacity): SlotDecision {
  return slotFor(userId, clustersOf(lab), capacity.queue, capacity, capacity);
}

/** The learner's place in line, or null when they are not waiting. */
export function queueEntryFor(userId: string, capacity: Capacity): { labId: string; mode: string; position: number } | null {
  const i = capacity.queue.findIndex((w) => w.userId === userId);
  return i < 0 ? null : { labId: capacity.queue[i]!.labId, mode: capacity.queue[i]!.mode, position: i + 1 };
}

/** Why this learner cannot start this lab now, or null. */
export function blockFor(lab: Pick<LabRow, "minutes" | "clusters">, usage: LabUsage, capacity: Capacity, now = new Date()): StartBlock | null {
  if (!capacity.controllerUp) return { reason: "controller-down" };
  return startBlock({
    labMinutes: lab.minutes,
    minutesUsed: usage.minutesUsed,
    monthlyMinutes: usage.monthlyMinutes,
    activeSessionId: usage.active?.id ?? null,
    slot: slotForLab(usage.userId, lab, capacity),
    now,
  });
}

export type StartOrQueue = { started: string } | { queued: { position: number; waiting: number } };

/**
 * Starts a session when there is room for this learner, else puts them in line (or refreshes their place). Runs
 * under one advisory lock, so two learners pressing Start at the same moment can never overfill the machine.
 * Throws when the one-active-session index refuses the insert (another tab started a lab a moment ago).
 */
export async function startOrQueue(userId: string, lab: Pick<LabRow, "id" | "certCode" | "minutes" | "clusters">, mode: "lab" | "exam" | "practice"): Promise<StartOrQueue> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('lfct:lab-capacity'))`);
    const [running, queue] = await Promise.all([getRunning(tx), getQueue(tx)]);
    const slot = slotFor(userId, clustersOf(lab), queue, running, capacityLimits());
    if (slot.ok) {
      const [row] = await tx
        .insert(labSession)
        .values({ userId, labId: lab.id, certCode: lab.certCode, provider: env.labs.provider, minutes: lab.minutes, mode })
        .returning({ id: labSession.id });
      await tx.delete(labQueue).where(eq(labQueue.userId, userId));
      return { started: row!.id };
    }
    // Joining again (or for another lab) keeps the learner's place in line.
    await tx
      .insert(labQueue)
      .values({ userId, labId: lab.id, mode, clusters: clustersOf(lab) })
      .onConflictDoUpdate({ target: labQueue.userId, set: { labId: lab.id, mode, clusters: clustersOf(lab), seenAt: sql`now()` } });
    const position = slot.position ?? queue.length + 1;
    return { queued: { position, waiting: Math.max(queue.length, position) } };
  });
}

/** The waiting page checks in: keeps the entry alive and says where the learner stands. */
export async function touchQueue(userId: string): Promise<{ position: number; waiting: number; turn: boolean; labId: string; mode: string } | null> {
  const [row] = await getDb().update(labQueue).set({ seenAt: sql`now()` }).where(eq(labQueue.userId, userId)).returning({ userId: labQueue.userId });
  if (!row) return null;
  const [running, queue] = await Promise.all([getRunning(), getQueue()]);
  const i = queue.findIndex((w) => w.userId === userId);
  if (i < 0) return null;
  const entry = queue[i]!;
  const slot = slotFor(userId, entry.clusters, queue, running, capacityLimits());
  return { position: i + 1, waiting: queue.length, turn: slot.ok, labId: entry.labId, mode: entry.mode };
}

export async function leaveQueue(userId: string): Promise<void> {
  await getDb().delete(labQueue).where(eq(labQueue.userId, userId));
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
