"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { question } from "@lfct/curriculum/db";
import { getDb } from "@/db";
import { answer, bookmark, certStatus, flag, lessonProgress, note, profile, quiz, reviewItem } from "@/db/schema";
import { isIsoDate } from "@/lib/dates";
import { nextReviewState } from "@/lib/review";
import { getCatalog } from "@/server/catalog";
import { getReviewDue } from "@/server/progress";
import { getProfile, requireUser } from "@/server/session";
import { learnerToday } from "@/server/today";

const CertCode = z.string().regex(/^[A-Z]{2,6}$/);
const Target = z.enum(["lesson", "question"]);

async function assertCert(code: string) {
  const catalog = await getCatalog();
  const cert = catalog.certs.get(code);
  if (!cert) throw new Error(`Unknown cert ${code}`);
  return { catalog, cert };
}

export async function setFocusAction(form: FormData): Promise<void> {
  const user = await requireUser("/path");
  const code = CertCode.parse(form.get("cert"));
  await assertCert(code);
  await getDb()
    .insert(profile)
    .values({ userId: user.id, focusCert: code })
    .onConflictDoUpdate({ target: profile.userId, set: { focusCert: code, updatedAt: new Date() } });
  revalidatePath("/", "layout");
}

export interface StatusFormState {
  error?: string;
  ok?: string;
}

/** Self-reported exam status: booked with a date, passed with a date, or cleared. */
export async function setExamStatusAction(_prev: StatusFormState, form: FormData): Promise<StatusFormState> {
  const user = await requireUser("/path");
  const code = CertCode.parse(form.get("cert"));
  await assertCert(code);
  const state = String(form.get("state"));
  const date = String(form.get("date") ?? "");
  const db = getDb();
  if (state === "clear") {
    await db.delete(certStatus).where(and(eq(certStatus.userId, user.id), eq(certStatus.certCode, code)));
    revalidatePath("/", "layout");
    return { ok: `${code} status cleared.` };
  }
  if (state !== "booked" && state !== "passed") return { error: "Choose booked or passed." };
  if (!isIsoDate(date)) return { error: state === "booked" ? "Enter the exam date." : "Enter the date you passed." };
  const today = learnerToday(await getProfile(user.id));
  if (state === "passed" && date > today) return { error: "The pass date cannot be in the future." };
  if (state === "booked" && date < today) return { error: "The exam date has passed. Mark it passed instead, or pick a new date." };
  const values =
    state === "booked"
      ? { state: "booked" as const, bookedFor: date, passedOn: null }
      : { state: "passed" as const, passedOn: date, bookedFor: null };
  await db
    .insert(certStatus)
    .values({ userId: user.id, certCode: code, ...values })
    .onConflictDoUpdate({ target: [certStatus.userId, certStatus.certCode], set: { ...values, updatedAt: new Date() } });

  // Passing the focus cert moves the focus to the next cert on the path.
  if (state === "passed") {
    const p = await getProfile(user.id);
    if (p?.focusCert === code) {
      const { chooseFocus } = await import("@/lib/path");
      const held = await db.select({ c: certStatus.certCode }).from(certStatus).where(and(eq(certStatus.userId, user.id), eq(certStatus.state, "passed")));
      const focus = chooseFocus(p.goal === "one" ? "golden" : p.goal, null, new Set(held.map((h) => h.c)));
      await db.update(profile).set({ focusCert: focus, updatedAt: new Date() }).where(eq(profile.userId, user.id));
    }
  }
  revalidatePath("/", "layout");
  return { ok: state === "booked" ? `${code} marked booked.` : `${code} marked passed. Well done.` };
}

export async function completeLessonAction(form: FormData): Promise<void> {
  const lessonId = z.string().min(1).parse(form.get("lesson"));
  const back = String(form.get("back") ?? "/today");
  const user = await requireUser(back);
  const catalog = await getCatalog();
  if (!catalog.lessonsById.has(lessonId)) throw new Error("Unknown lesson");
  const undo = form.get("undo") === "1";
  const db = getDb();
  if (undo) {
    await db.delete(lessonProgress).where(and(eq(lessonProgress.userId, user.id), eq(lessonProgress.lessonId, lessonId)));
  } else {
    await db.insert(lessonProgress).values({ userId: user.id, lessonId }).onConflictDoNothing();
  }
  revalidatePath(back.startsWith("/") ? back : "/today");
}

export async function toggleBookmarkAction(form: FormData): Promise<void> {
  const back = String(form.get("back") ?? "/saved");
  const user = await requireUser(back);
  const targetType = Target.parse(form.get("targetType"));
  const targetId = z.string().min(1).max(100).parse(form.get("targetId"));
  const db = getDb();
  const where = and(eq(bookmark.userId, user.id), eq(bookmark.targetType, targetType), eq(bookmark.targetId, targetId));
  const existing = await db.select().from(bookmark).where(where);
  if (existing.length > 0) await db.delete(bookmark).where(where);
  else await db.insert(bookmark).values({ userId: user.id, targetType, targetId });
  revalidatePath(back.startsWith("/") ? back : "/saved");
}

export async function saveNoteAction(_prev: { saved?: boolean }, form: FormData): Promise<{ saved?: boolean; error?: string }> {
  const user = await requireUser("/saved");
  const targetType = Target.parse(form.get("targetType"));
  const targetId = z.string().min(1).max(100).parse(form.get("targetId"));
  const body = String(form.get("body") ?? "").slice(0, 5000);
  const db = getDb();
  if (body.trim() === "") {
    await db.delete(note).where(and(eq(note.userId, user.id), eq(note.targetType, targetType), eq(note.targetId, targetId)));
  } else {
    await db
      .insert(note)
      .values({ userId: user.id, targetType, targetId, body })
      .onConflictDoUpdate({ target: [note.userId, note.targetType, note.targetId], set: { body, updatedAt: new Date() } });
  }
  revalidatePath("/saved");
  return { saved: true };
}

const FLAG_REASONS = ["wrong-answer", "unclear", "broken-link", "typo", "other"] as const;

export async function flagItemAction(_prev: { sent?: boolean; error?: string }, form: FormData): Promise<{ sent?: boolean; error?: string }> {
  const user = await requireUser("/today");
  const parsed = z
    .object({ targetType: Target, targetId: z.string().min(1).max(100), reason: z.enum(FLAG_REASONS), details: z.string().max(2000).optional() })
    .safeParse({
      targetType: form.get("targetType"),
      targetId: form.get("targetId"),
      reason: form.get("reason"),
      details: String(form.get("details") ?? "") || undefined,
    });
  if (!parsed.success) return { error: "Choose what is wrong." };
  await getDb().insert(flag).values({ userId: user.id, ...parsed.data, details: parsed.data.details ?? null });
  return { sent: true };
}

const StartQuiz = z.object({
  cert: CertCode,
  domains: z.array(z.string()).default([]),
  competency: z.string().max(200).optional(),
  count: z.coerce.number().int().min(1).max(30),
  feedback: z.enum(["instant", "end"]),
});

/** Picks questions for a practice quiz: unseen first, then the ones answered wrong most recently, then the rest. */
export async function startQuizAction(form: FormData): Promise<void> {
  const user = await requireUser("/practice");
  const parsed = StartQuiz.safeParse({
    cert: form.get("cert"),
    domains: form.getAll("domains").map(String),
    competency: form.get("competency") ? String(form.get("competency")) : undefined,
    count: form.get("count") ?? 5,
    feedback: form.get("feedback") ?? "instant",
  });
  if (!parsed.success) redirect("/practice?error=invalid");
  const { cert: code, domains, competency, count, feedback } = parsed.data;
  const { cert } = await assertCert(code);
  const validDomains = domains.filter((d) => cert.domains.some((x) => x.key === d));
  const prefixes = validDomains.map((d) => `${code.toLowerCase()}/${d}/`);
  const db = getDb();
  const candidates = await db
    .select({ id: question.id, refs: question.competencyRefs })
    .from(question)
    .where(and(eq(question.certCode, code), isNull(question.knownIssue), eq(question.published, true)));
  const pool = competency
    ? candidates.filter((q) => q.refs.includes(competency))
    : prefixes.length === 0
      ? candidates
      : candidates.filter((q) => q.refs.some((r) => prefixes.some((p) => r.startsWith(p))));
  if (pool.length === 0) {
    redirect(`/practice?cert=${code}&empty=1${validDomains.map((d) => `&domains=${encodeURIComponent(d)}`).join("")}`);
  }
  const history = await db
    .select({ id: answer.questionId, last: sql<string>`max(${answer.answeredAt})`, wrong: sql<number>`sum(case when ${answer.correct} then 0 else 1 end)::int` })
    .from(answer)
    .where(and(eq(answer.userId, user.id), inArray(answer.questionId, pool.map((q) => q.id))))
    .groupBy(answer.questionId);
  const seen = new Map(history.map((h) => [h.id, h]));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const unseen = shuffled.filter((q) => !seen.has(q.id));
  const missed = shuffled.filter((q) => (seen.get(q.id)?.wrong ?? 0) > 0);
  const rest = shuffled.filter((q) => seen.has(q.id) && (seen.get(q.id)?.wrong ?? 0) === 0);
  const ids = [...new Set([...unseen, ...missed, ...rest].map((q) => q.id))].slice(0, count);
  const [row] = await db
    .insert(quiz)
    .values({ userId: user.id, kind: "practice", feedback, certCode: code, domainKeys: validDomains, questionIds: ids })
    .returning({ id: quiz.id });
  redirect(`/quiz/${row!.id}`);
}

/** Starts a review session of up to 20 due questions, across certs or for the cert in the form's "cert" field. */
export async function startReviewAction(formData?: FormData): Promise<void> {
  const user = await requireUser("/review");
  const today = learnerToday(await getProfile(user.id));
  const rawCert = formData?.get("cert");
  const certCode = typeof rawCert === "string" && /^[A-Z0-9-]{2,12}$/.test(rawCert) ? rawCert : undefined;
  const due = await getReviewDue(user.id, today, certCode);
  if (due.count === 0) redirect("/review");
  const [row] = await getDb()
    .insert(quiz)
    .values({ userId: user.id, kind: "review", feedback: "instant", certCode: certCode ?? null, questionIds: due.ids.slice(0, 20) })
    .returning({ id: quiz.id });
  redirect(`/quiz/${row!.id}`);
}

export interface AnswerResult {
  correct: boolean;
  correctIds: string[];
  explanation: string;
  sourceTitle: string;
  sourceUrl: string;
  reviewDueOn: string | null;
  feedback: "instant" | "end";
}

/** Records one answer, updates the review schedule, and returns feedback (instant mode) or just an acknowledgement. */
export async function submitAnswerAction(quizId: string, questionId: string, selected: string[]): Promise<AnswerResult | { error: string }> {
  const user = await requireUser(`/quiz/${quizId}`);
  if (!z.uuid().safeParse(quizId).success) return { error: "Unknown quiz." };
  const db = getDb();
  const [q] = await db.select().from(quiz).where(and(eq(quiz.id, quizId), eq(quiz.userId, user.id)));
  if (!q || !q.questionIds.includes(questionId)) return { error: "This question is not part of the quiz." };
  // Mock exam answers are saved as a draft and graded on submit (actions/quiz-mocks.ts).
  if (q.kind === "mock") return { error: "This question is part of a mock exam." };
  const [item] = await db.select().from(question).where(eq(question.id, questionId));
  if (!item) return { error: "This question is no longer available." };
  const choice = [...new Set(selected.map(String))].filter((id) => item.options.some((o) => o.id === id)).sort();
  if (choice.length === 0) return { error: "Choose an answer first." };
  const correctIds = item.options.filter((o) => o.correct).map((o) => o.id).sort();
  const correct = choice.length === correctIds.length && choice.every((id, i) => id === correctIds[i]);
  const today = learnerToday(await getProfile(user.id));

  const result = await db.transaction(async (tx) => {
    const already = await tx.select({ id: answer.id }).from(answer).where(and(eq(answer.quizId, quizId), eq(answer.questionId, questionId)));
    if (already.length === 0) {
      await tx.insert(answer).values({ userId: user.id, quizId, questionId, certCode: item.certCode, selected: choice, correct });
      const [current] = await tx.select().from(reviewItem).where(and(eq(reviewItem.userId, user.id), eq(reviewItem.questionId, questionId)));
      const next = nextReviewState(current ? { box: current.box, dueOn: current.dueOn, lapses: current.lapses } : undefined, correct, today);
      if (next === null) {
        await tx.delete(reviewItem).where(and(eq(reviewItem.userId, user.id), eq(reviewItem.questionId, questionId)));
      } else if (next) {
        await tx
          .insert(reviewItem)
          .values({ userId: user.id, questionId, ...next })
          .onConflictDoUpdate({ target: [reviewItem.userId, reviewItem.questionId], set: { ...next, updatedAt: new Date() } });
      }
      const answered = await tx.select({ n: sql<number>`count(*)::int` }).from(answer).where(eq(answer.quizId, quizId));
      if ((answered[0]?.n ?? 0) >= q.questionIds.length) {
        await tx.update(quiz).set({ finishedAt: new Date() }).where(eq(quiz.id, quizId));
      }
      return next ? next.dueOn : null;
    }
    const [rs] = await tx.select().from(reviewItem).where(and(eq(reviewItem.userId, user.id), eq(reviewItem.questionId, questionId)));
    return rs?.dueOn ?? null;
  });

  // No revalidatePath here: it would make Next re-render the quiz page in this response, which swaps in the next
  // question before the learner reads the feedback. Today and Review are dynamic and read fresh data on each visit.
  if (q.feedback === "end") {
    // End-of-quiz feedback: reveal nothing until the results screen.
    return { correct: false, correctIds: [], explanation: "", sourceTitle: "", sourceUrl: "", reviewDueOn: null, feedback: "end" };
  }
  return {
    correct,
    correctIds,
    explanation: item.explanation,
    sourceTitle: item.sourceTitle,
    sourceUrl: item.sourceUrl,
    reviewDueOn: result,
    feedback: q.feedback,
  };
}
