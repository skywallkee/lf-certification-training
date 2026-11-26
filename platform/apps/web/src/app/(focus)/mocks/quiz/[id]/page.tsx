import { and, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import * as z from "zod";
import { question as questionTable } from "@lfct/curriculum/db";
import { Markdown } from "@/components/markdown";
import { QuizMockPlayer } from "@/components/mocks/quiz-mock-player";
import { getDb } from "@/db";
import { quiz } from "@/db/schema";
import { getQuizMock, gradeAttempt, GRACE_MS } from "@/server/quiz-mocks";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Mock exam" };

export default async function QuizMockAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/mocks/quiz/${id}`);
  const db = getDb();
  const [attempt] = await db.select().from(quiz).where(and(eq(quiz.id, id), eq(quiz.userId, user.id), eq(quiz.kind, "mock")));
  if (!attempt) notFound();
  // Submitted, or time ran out with the tab closed: grade what was saved and show the results.
  if (!attempt.finishedAt && attempt.expiresAt && attempt.expiresAt.getTime() + GRACE_MS < Date.now()) await gradeAttempt(attempt);
  if (attempt.finishedAt || !attempt.expiresAt || attempt.expiresAt.getTime() + GRACE_MS < Date.now()) redirect(`/mocks/quiz-results/${id}`);

  const [mock, rows] = await Promise.all([
    getQuizMock(attempt.mockId ?? ""),
    db.select().from(questionTable).where(inArray(questionTable.id, attempt.questionIds)),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Only what the learner may see: no correct flags, explanations or sources until the attempt is graded.
  const questions = attempt.questionIds.flatMap((qid) => {
    const q = byId.get(qid);
    if (!q) return [];
    return [
      {
        id: q.id,
        kind: q.kind,
        stem: <Markdown>{q.stem}</Markdown>,
        options: q.options.map((o) => ({ id: o.id, content: <Markdown>{o.text}</Markdown> })),
      },
    ];
  });
  if (questions.length === 0) notFound();

  return (
    <QuizMockPlayer
      attemptId={attempt.id}
      title={mock?.title ?? "Mock exam"}
      mock={mock?.mock ?? true}
      passPercent={attempt.passPercent ?? mock?.passPercent ?? 75}
      questions={questions}
      initial={attempt.draft ?? { answers: {}, flags: [], current: 0 }}
      expiresAt={attempt.expiresAt.toISOString()}
      serverNow={new Date().toISOString()}
    />
  );
}
