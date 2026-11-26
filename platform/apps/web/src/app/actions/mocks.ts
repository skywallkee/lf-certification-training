"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { MOCK_MODES, type CheckResult } from "@lfct/labs";
import { getDb } from "@/db";
import { labSession } from "@/db/schema";
import { env } from "@/env";
import { callController, ControllerError, getCapacity, getSession, getUsage } from "@/server/labs";
import { getMock, getMockAttemptsUsed, mockBlockFor } from "@/server/mocks";
import { canOpen } from "@/server/labs";
import { requireUser } from "@/server/session";

const SessionId = z.uuid();

/**
 * Prepare: checks the attempt allowance and capacity, records the attempt and asks the controller to boot its
 * clusters. The clock does not start yet: the learner presses Start on the prepare screen.
 */
export async function startMockAction(form: FormData): Promise<void> {
  const mockId = z.string().min(1).max(64).parse(form.get("mock"));
  const mode = z.enum(MOCK_MODES).catch("exam").parse(form.get("mode"));
  const user = await requireUser(`/mocks/${mockId}`);
  const mock = await getMock(mockId);
  if (!mock || !canOpen(mock, user)) redirect("/mocks");
  const [used, usage, capacity] = await Promise.all([getMockAttemptsUsed(user.id), getUsage(user.id), getCapacity()]);
  const block = mockBlockFor(mock, mode, used, usage, capacity);
  // The lab session page sends a mock attempt on to the mock player.
  if (block?.reason === "active-session") redirect(`/labs/sessions/${block.sessionId}`);
  if (block) redirect(`/mocks/${mock.id}?blocked=${block.reason}&mode=${mode}`);

  let sessionId: string;
  try {
    const [row] = await getDb()
      .insert(labSession)
      .values({ userId: user.id, labId: mock.id, certCode: mock.certCode, provider: env.labs.provider, minutes: mock.minutes, mode })
      .returning({ id: labSession.id });
    sessionId = row!.id;
  } catch {
    // The one-active-session index: another tab started a lab or mock a moment ago.
    redirect("/mocks");
  }
  try {
    await callController(`/sessions/${sessionId}/provision`, { timeoutMs: 10_000 });
  } catch (err) {
    await getDb()
      .update(labSession)
      .set({ status: "failed", endedAt: new Date(), statusMessage: (err as Error).message })
      .where(eq(labSession.id, sessionId));
  }
  redirect(`/mocks/attempts/${sessionId}`);
}

export type BeginState = { ok: true; expiresAt: string; startedAt: string } | { ok: false; error: string };

/** Start: the clusters are ready; the exam clock starts now and the terminal opens. */
export async function beginMockAction(sessionId: string): Promise<BeginState> {
  const id = SessionId.parse(sessionId);
  const user = await requireUser(`/mocks/attempts/${id}`);
  const [row] = await getDb()
    .update(labSession)
    .set({ startedAt: sql`now()`, expiresAt: sql`now() + make_interval(mins => ${labSession.minutes})`, statusMessage: "Exam started" })
    .where(
      and(
        eq(labSession.id, id),
        eq(labSession.userId, user.id),
        eq(labSession.status, "ready"),
        isNull(labSession.startedAt),
        sql`${labSession.mode} <> 'lab'`,
        sql`${labSession.expiresAt} > now()`,
      ),
    )
    .returning({ expiresAt: labSession.expiresAt, startedAt: labSession.startedAt });
  if (!row?.expiresAt || !row.startedAt) {
    const s = await getSession(id, user.id);
    if (s?.startedAt && s.expiresAt) return { ok: true, expiresAt: s.expiresAt.toISOString(), startedAt: s.startedAt.toISOString() };
    return { ok: false, error: "This attempt cannot start: it is not ready, or its start window has passed." };
  }
  return { ok: true, expiresAt: row.expiresAt.toISOString(), startedAt: row.startedAt.toISOString() };
}

export type TaskCheckState = { ok: true; taskId: string; results: CheckResult[]; at: string } | { ok: false; error: string };

/** Practice mode only: grades one task now. The controller refuses it in exam mode. */
export async function checkMockTaskAction(sessionId: string, taskId: string): Promise<TaskCheckState> {
  const id = SessionId.parse(sessionId);
  const task = z.string().min(1).max(64).parse(taskId);
  const user = await requireUser(`/mocks/attempts/${id}`);
  const session = await getSession(id, user.id);
  if (!session || session.status !== "ready" || !session.startedAt) return { ok: false, error: "This attempt is not running." };
  if (session.mode !== "practice") return { ok: false, error: "Exam mode gives no feedback until the end." };
  try {
    const out = await callController<{ results: CheckResult[] }>(`/sessions/${id}/check?task=${encodeURIComponent(task)}`);
    return { ok: true, taskId: task, results: out.results.map(({ detail: _detail, ...r }) => r), at: new Date().toISOString() };
  } catch (err) {
    return { ok: false, error: err instanceof ControllerError ? err.message : "Checking failed. Try again." };
  }
}

/** Submit (or time up): freeze the terminal, grade every task, delete the clusters, show the results. */
export async function submitMockAction(form: FormData): Promise<void> {
  const id = SessionId.parse(form.get("session"));
  const user = await requireUser(`/mocks/attempts/${id}`);
  const session = await getSession(id, user.id);
  if (!session || session.mode === "lab") redirect("/mocks");
  try {
    await callController(`/sessions/${id}/finish`, { timeoutMs: 300_000 });
  } catch (err) {
    // The controller is gone: end the row so the learner is not stuck; the sweeper removes leftovers later.
    await getDb()
      .update(labSession)
      .set({ status: "finished", endedAt: new Date(), statusMessage: (err as Error).message })
      .where(and(eq(labSession.id, id), sql`${labSession.status} in ('requested', 'booting', 'ready')`));
  }
  revalidatePath("/mocks");
  redirect(`/mocks/results/${id}`);
}
