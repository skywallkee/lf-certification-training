"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { EXTEND_MINUTES, type CheckResult } from "@lfct/labs";
import { getDb } from "@/db";
import { labHintUse, labSession } from "@/db/schema";
import {
  blockFor,
  callController,
  ControllerError,
  getCapacity,
  getHintUses,
  getLab,
  getSession,
  getUsage,
  canOpen,
  leaveQueue,
  startOrQueue,
  type StartOrQueue,
} from "@/server/labs";
import { requireAdmin, requireUser } from "@/server/session";

const SessionId = z.uuid();

/**
 * Starts a lab: checks the allowance, then records the session and asks the controller to boot it, or, when the
 * machine is full, puts the learner in line (the lab page then waits and presses Start again on their turn).
 */
export async function startLabAction(form: FormData): Promise<void> {
  const labId = z.string().min(1).max(64).parse(form.get("lab"));
  const user = await requireUser(`/labs/${labId}`);
  const lab = await getLab(labId);
  if (!lab || !canOpen(lab, user)) redirect("/labs");
  if (lab.kind === "mock") redirect(`/mocks/${lab.id}`);
  const [usage, capacity] = await Promise.all([getUsage(user.id), getCapacity()]);
  const block = blockFor(lab, usage, capacity);
  if (block?.reason === "active-session") redirect(`/labs/sessions/${block.sessionId}`);
  if (block && block.reason !== "capacity") redirect(`/labs/${lab.id}?blocked=${block.reason}`);

  let result: StartOrQueue;
  try {
    result = await startOrQueue(user.id, lab, "lab");
  } catch {
    // The one-active-session index: another tab started a lab a moment ago.
    redirect("/labs");
  }
  if ("queued" in result) redirect(`/labs/${lab.id}`);
  const sessionId = result.started;
  try {
    await callController(`/sessions/${sessionId}/provision`, { timeoutMs: 10_000 });
  } catch (err) {
    await getDb()
      .update(labSession)
      .set({ status: "failed", endedAt: new Date(), statusMessage: (err as Error).message })
      .where(eq(labSession.id, sessionId));
  }
  redirect(`/labs/sessions/${sessionId}`);
}

export type CheckState = { ok: true; results: CheckResult[]; score: number; at: string } | { ok: false; error: string };

/** "Check my work": grades the cluster now. Results are stored by the controller and returned here. */
export async function checkLabAction(sessionId: string): Promise<CheckState> {
  const id = SessionId.parse(sessionId);
  const user = await requireUser(`/labs/sessions/${id}`);
  const session = await getSession(id, user.id);
  if (!session || session.status !== "ready") return { ok: false, error: "This lab is not running." };
  if (session.mode !== "lab") return { ok: false, error: "Mock exams check one task at a time, in practice mode only." };
  try {
    const out = await callController<{ results: CheckResult[]; score: number }>(`/sessions/${id}/check`);
    return { ok: true, results: out.results.map(({ detail: _detail, ...r }) => r), score: out.score, at: new Date().toISOString() };
  } catch (err) {
    return { ok: false, error: err instanceof ControllerError ? err.message : "Checking failed. Try again." };
  }
}

/** Finish: grade one last time, delete the cluster, show the results. */
export async function finishLabAction(form: FormData): Promise<void> {
  const id = SessionId.parse(form.get("session"));
  const user = await requireUser(`/labs/sessions/${id}`);
  const session = await getSession(id, user.id);
  if (!session) redirect("/labs");
  try {
    await callController(`/sessions/${id}/finish`, { timeoutMs: 180_000 });
  } catch (err) {
    // The controller is gone: end the row so the learner is not stuck; the sweeper removes leftovers later.
    await getDb()
      .update(labSession)
      .set({ status: "finished", endedAt: new Date(), statusMessage: (err as Error).message })
      .where(and(eq(labSession.id, id), sql`${labSession.status} in ('requested', 'booting', 'ready')`));
  }
  revalidatePath("/labs");
  redirect(`/labs/history/${id}`);
}

export type ExtendState = { ok: true; expiresAt: string } | { ok: false; error: string };

/** Adds EXTEND_MINUTES once, if the allowance has room for it. */
export async function extendLabAction(sessionId: string): Promise<ExtendState> {
  const id = SessionId.parse(sessionId);
  const user = await requireUser(`/labs/sessions/${id}`);
  const usage = await getUsage(user.id);
  const session = usage.active?.id === id ? usage.active : null;
  if (!session || session.status !== "ready" || !session.expiresAt) return { ok: false, error: "This lab is not running." };
  if (session.mode !== "lab") return { ok: false, error: "Mock exams cannot be extended." };
  if (session.extended) return { ok: false, error: "You have already extended this lab once." };
  const remaining = Math.max(0, Math.ceil((session.expiresAt.getTime() - Date.now()) / 60_000));
  if (usage.minutesLeft - remaining < EXTEND_MINUTES) return { ok: false, error: "Your lab minutes for this month do not cover an extension." };
  const [row] = await getDb()
    .update(labSession)
    .set({ extended: true, expiresAt: sql`${labSession.expiresAt} + make_interval(mins => ${EXTEND_MINUTES})` })
    .where(and(eq(labSession.id, id), eq(labSession.status, "ready"), eq(labSession.extended, false)))
    .returning({ expiresAt: labSession.expiresAt });
  if (!row?.expiresAt) return { ok: false, error: "This lab could not be extended." };
  return { ok: true, expiresAt: row.expiresAt.toISOString() };
}

export type HintState = { ok: true; index: number; text: string } | { ok: false; error: string };

/** Opens the next hint of a task and records that it was used. */
export async function revealHintAction(sessionId: string, taskId: string): Promise<HintState> {
  const id = SessionId.parse(sessionId);
  const user = await requireUser(`/labs/sessions/${id}`);
  const session = await getSession(id, user.id);
  if (!session || session.status !== "ready") return { ok: false, error: "This lab is not running." };
  const lab = await getLab(session.labId);
  const task = lab?.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, error: "No such task." };
  const used = (await getHintUses(id)).filter((h) => h.taskId === taskId).length;
  if (used >= task.hints.length) return { ok: false, error: "No more hints for this task." };
  await getDb().insert(labHintUse).values({ sessionId: id, taskId, hintIndex: used }).onConflictDoNothing();
  return { ok: true, index: used, text: task.hints[used]! };
}

/** Leaves the waiting line for a lab or mock slot. */
export async function leaveQueueAction(form: FormData): Promise<void> {
  const back = z.string().regex(/^\/(labs|mocks)\/[\w-]{1,64}$/).catch("/labs").parse(form.get("back"));
  const user = await requireUser(back);
  await leaveQueue(user.id);
  redirect(back);
}

/** Admin: end a session without grading. */
export async function killLabAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = SessionId.parse(form.get("session"));
  try {
    await callController(`/sessions/${id}/kill`, { timeoutMs: 60_000 });
  } catch {
    await getDb()
      .update(labSession)
      .set({ status: "killed", endedAt: new Date(), statusMessage: "Ended by an admin (controller unreachable)." })
      .where(and(eq(labSession.id, id), sql`${labSession.status} in ('requested', 'booting', 'ready')`));
  }
  revalidatePath("/admin/labs");
}
