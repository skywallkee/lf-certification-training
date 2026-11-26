"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { question as questionTable } from "@lfct/curriculum/db";
import { getDb } from "@/db";
import { quiz, type QuizDraftJson } from "@/db/schema";
import { canOpen } from "@/server/labs";
import { cleanDraft, getQuizMock, gradeAttempt, GRACE_MS, startQuizMock } from "@/server/quiz-mocks";
import { requireUser } from "@/server/session";

const AttemptId = z.uuid();
const Draft = z.object({
  answers: z.record(z.string().max(64), z.array(z.string().max(4)).max(6)),
  flags: z.array(z.string().max(64)).max(200),
  current: z.number().int().min(0).max(500),
});

/** Starts a multiple-choice mock attempt (or opens the one already running) and goes to the exam player. */
export async function startQuizMockAction(form: FormData): Promise<void> {
  const mockId = z.string().min(1).max(64).parse(form.get("mock"));
  const user = await requireUser("/mocks");
  const mock = await getQuizMock(mockId);
  if (!mock || !canOpen(mock, user)) redirect("/mocks");
  const attemptId = await startQuizMock(user.id, mock);
  if (!attemptId) redirect(`/mocks?empty=${encodeURIComponent(mock.id)}`);
  redirect(`/mocks/quiz/${attemptId}`);
}

async function ownAttempt(attemptId: string) {
  if (!AttemptId.safeParse(attemptId).success) return null;
  const user = await requireUser(`/mocks/quiz/${attemptId}`);
  const [row] = await getDb()
    .select()
    .from(quiz)
    .where(and(eq(quiz.id, attemptId), eq(quiz.userId, user.id), eq(quiz.kind, "mock")));
  return row ?? null;
}

async function optionIds(questionIds: string[]) {
  const rows = await getDb().select({ id: questionTable.id, options: questionTable.options }).from(questionTable).where(inArray(questionTable.id, questionIds));
  return new Map(rows.map((r) => [r.id, r.options.map((o) => o.id)]));
}

export type DraftSaveResult = { ok: true } | { ok: false; ended: boolean; error: string };

/** Autosave while the clock runs: answers, flags and the current question. Refused once the attempt has ended. */
export async function saveQuizDraftAction(attemptId: string, input: QuizDraftJson): Promise<DraftSaveResult> {
  const attempt = await ownAttempt(attemptId);
  if (!attempt) return { ok: false, ended: false, error: "Unknown attempt." };
  if (attempt.finishedAt || !attempt.expiresAt || attempt.expiresAt.getTime() + GRACE_MS < Date.now()) {
    return { ok: false, ended: true, error: "This attempt has ended." };
  }
  const parsed = Draft.safeParse(input);
  if (!parsed.success) return { ok: false, ended: false, error: "Could not save the answers." };
  const draft = cleanDraft(parsed.data, attempt.questionIds, await optionIds(attempt.questionIds));
  await getDb().update(quiz).set({ draft }).where(eq(quiz.id, attempt.id));
  return { ok: true };
}

/** Submit (or time up): saves the last answers when still in time, then grades the attempt. */
export async function submitQuizMockAction(attemptId: string, input: QuizDraftJson | null): Promise<DraftSaveResult> {
  const attempt = await ownAttempt(attemptId);
  if (!attempt) return { ok: false, ended: false, error: "Unknown attempt." };
  if (!attempt.finishedAt) {
    let current = attempt;
    const inTime = attempt.expiresAt !== null && attempt.expiresAt.getTime() + GRACE_MS >= Date.now();
    const parsed = input ? Draft.safeParse(input) : null;
    if (inTime && parsed?.success) {
      const draft = cleanDraft(parsed.data, attempt.questionIds, await optionIds(attempt.questionIds));
      const [updated] = await getDb().update(quiz).set({ draft }).where(eq(quiz.id, attempt.id)).returning();
      if (updated) current = updated;
    }
    await gradeAttempt(current);
  }
  revalidatePath("/mocks");
  return { ok: true };
}
