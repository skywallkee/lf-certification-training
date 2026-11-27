"use server";

import { and, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import * as z from "zod";
import { DiagramsSchema, NARRATION_VOICES, VideoSchema, draftVideo, type NarrationVoice, itemFromSource, itemToSource, lessonMediaProblems, validateItem, type ItemType, type LabEdit, type LessonEdit, type QuestionEdit, type QuizMockEdit } from "@lfct/curriculum";
import { lab as labTable, lesson as lessonTable, question as questionTable, quizMock as quizMockTable } from "@lfct/curriculum/db";
import { LessonBody } from "@/components/lesson-body";
import { LessonVideo } from "@/components/lesson-video";
import { getDb } from "@/db";
import { answer, contentRevision, labSession, lessonProgress, quiz } from "@/db/schema";
import { mdxProblems } from "@/lib/mdx-safety";
import { invalidateCatalog } from "@/server/catalog";
import { playerScenes, prewarmNarration } from "@/server/narration";
import {
  authoringContext,
  getFileVersion,
  getItem,
  idTaken,
  isItemType,
  labValues,
  lessonValues,
  questionValues,
  quizMockValues,
  type ItemEdit,
} from "@/server/content";
import { requireAdmin } from "@/server/session";

/**
 * Admin content editor. Items are validated with the content schemas the ingest uses, stored with origin "app"
 * (so the ingest leaves them alone) and every change is recorded in content_revision. New items start as drafts.
 */

export interface SaveState {
  problems: string[];
}

const TypeSchema = z.string().refine(isItemType, "unknown content type") as unknown as z.ZodType<ItemType>;
const IdSchema = z.string().min(1).max(64);

function editorPath(type: ItemType, id: string) {
  return `/admin/content/${type}/${encodeURIComponent(id)}`;
}

function refresh() {
  invalidateCatalog();
  // Lessons, questions and labs show up all over the learner pages; an admin save is rare, so refresh them all.
  revalidatePath("/", "layout");
}

async function record(type: ItemType, itemId: string, action: string, userId: string, snapshot: ItemEdit | Record<string, unknown> | null) {
  await getDb()
    .insert(contentRevision)
    .values({ itemType: type, itemId, action, userId, snapshot: snapshot as Record<string, unknown> | null });
}

/** Writes an item's row. `origin` is "app" for editor saves, "file" when reverting to the file version. */
async function writeRow(type: ItemType, edit: ItemEdit, opts: { create: boolean; origin: "file" | "app"; file?: string }) {
  const db = getDb();
  const common = { origin: opts.origin, updatedAt: new Date() };
  if (type === "lesson") {
    const values = { ...lessonValues(edit as LessonEdit), ...common };
    if (opts.create) await db.insert(lessonTable).values({ id: edit.id, ...values, published: false, file: opts.file ?? "app" });
    else await db.update(lessonTable).set(values).where(eq(lessonTable.id, edit.id));
    // Narrate the new or changed sentences in the background, so the video is ready when learners open it.
    if ((edit as LessonEdit).video) void prewarmNarration(edit.id).catch(() => undefined);
  } else if (type === "question") {
    const values = { ...questionValues(edit as QuestionEdit), ...common };
    if (opts.create) await db.insert(questionTable).values({ id: edit.id, ...values, published: false, file: opts.file ?? "app" });
    else await db.update(questionTable).set(values).where(eq(questionTable.id, edit.id));
  } else if (type === "quiz-mock") {
    const values = { ...quizMockValues(edit as QuizMockEdit), ...common };
    if (opts.create) await db.insert(quizMockTable).values({ id: edit.id, ...values, published: false, file: opts.file ?? "app" });
    else await db.update(quizMockTable).set(values).where(eq(quizMockTable.id, edit.id));
  } else {
    const values = { ...labValues(edit as LabEdit, type), ...common };
    if (opts.create) await db.insert(labTable).values({ id: edit.id, ...values, published: false, file: opts.file ?? "app" });
    else await db.update(labTable).set(values).where(and(eq(labTable.id, edit.id), eq(labTable.kind, type)));
  }
}

async function check(type: ItemType, input: unknown): Promise<{ ok: true; value: ItemEdit } | { ok: false; problems: string[] }> {
  const result = validateItem(type, input, await authoringContext());
  if (!result.ok) return result;
  if (type === "lesson") {
    const problems = mdxProblems((result.value as LessonEdit).body);
    if (problems.length) return { ok: false, problems };
  }
  if (type === "quiz-mock") {
    const m = result.value as QuizMockEdit;
    if (m.questions) {
      const rows = await getDb().select({ id: questionTable.id, certCode: questionTable.certCode }).from(questionTable).where(inArray(questionTable.id, m.questions));
      const certOf = new Map(rows.map((r) => [r.id, r.certCode]));
      const problems = m.questions.flatMap((id, i) =>
        !certOf.has(id) ? [`questions.${i}: unknown question "${id}"`] : certOf.get(id) !== m.cert ? [`questions.${i}: "${id}" is a ${certOf.get(id)} question, not ${m.cert}`] : [],
      );
      if (problems.length) return { ok: false, problems };
    }
  }
  return result;
}

/**
 * Saves a new or edited item. The form sends `mode` "form" (payload: the item as JSON) or "source" (payload: the
 * item in its file format, MDX or YAML). Returns the problems when the item is invalid; redirects when saved.
 */
export async function saveItemAction(_prev: SaveState, form: FormData): Promise<SaveState> {
  const admin = await requireAdmin();
  const type = TypeSchema.parse(form.get("type"));
  const originalId = String(form.get("originalId") ?? "");
  const mode = form.get("mode") === "source" ? "source" : "form";
  const payload = String(form.get("payload") ?? "");

  let input: unknown;
  try {
    input = mode === "source" ? itemFromSource(type, payload) : JSON.parse(payload);
  } catch (err) {
    return { problems: [`Could not read the ${mode === "source" ? "source" : "form"}: ${(err as Error).message}`] };
  }
  const result = await check(type, input);
  if (!result.ok) return { problems: result.problems };
  const edit = result.value;

  const existing = originalId ? await getItem(type, originalId) : null;
  if (originalId && !existing) return { problems: ["This item no longer exists. Copy your changes, then reload the page."] };
  if (existing && edit.id !== originalId) {
    return { problems: [`id: cannot change after an item is created (learner progress refers to "${originalId}"). Create a new item instead.`] };
  }
  if (!existing && edit.id === "new") return { problems: [`id: "new" is reserved`] };
  if (!existing && (await idTaken(type, edit.id))) {
    return { problems: [`id: "${edit.id}" is already used by another ${type === "lab" || type === "mock" || type === "quiz-mock" ? "lab or mock exam" : type}`] };
  }

  if (existing?.meta.origin === "file") {
    // First edit of an ingested item: keep the file version so "Revert to file version" can undo the edits.
    await record(type, edit.id, "file-version", admin.id, existing.edit);
  }
  await writeRow(type, edit, { create: !existing, origin: "app" });
  await record(type, edit.id, existing ? "updated" : "created", admin.id, edit);
  refresh();
  redirect(`${editorPath(type, edit.id)}?saved=${existing ? "1" : "new"}`);
}

/** Converts between the form and the file format, so the editor can switch views without losing edits. */
export async function convertItemAction(type: ItemType, to: "source" | "form", payload: string): Promise<{ ok: true; value: string } | { ok: false; problem: string }> {
  await requireAdmin();
  if (!isItemType(type)) return { ok: false, problem: "unknown content type" };
  try {
    if (to === "source") return { ok: true, value: itemToSource(type, JSON.parse(payload)) };
    return { ok: true, value: JSON.stringify(itemFromSource(type, payload)) };
  } catch (err) {
    return { ok: false, problem: (err as Error).message };
  }
}

/**
 * Renders a lesson exactly as learners will see it, for the editor's Preview tab: the video (when it has one) and
 * the body with its diagrams. Takes the lesson as editor JSON; problems in the diagrams or video are listed
 * instead of the parts they break.
 */
export async function previewLessonAction(lessonJson: string): Promise<{ problems: string[]; node: ReactNode | null }> {
  await requireAdmin();
  let lesson: Record<string, unknown>;
  try {
    lesson = JSON.parse(lessonJson) as Record<string, unknown>;
  } catch {
    return { problems: ["the lesson does not parse"], node: null };
  }
  const body = typeof lesson.body === "string" ? lesson.body : "";
  const problems = mdxProblems(body);
  const diagrams = DiagramsSchema.safeParse(lesson.diagrams ?? {});
  if (!diagrams.success) problems.push(...diagrams.error.issues.map((i) => `diagrams.${i.path.join(".")}: ${i.message}`));
  const video = lesson.video === undefined || lesson.video === null ? null : VideoSchema.safeParse(lesson.video);
  if (video && !video.success) problems.push(...video.error.issues.map((i) => `video.${i.path.join(".")}: ${i.message}`));
  if (diagrams.success && (!video || video.success)) problems.push(...lessonMediaProblems({ body, diagrams: diagrams.data, video: video?.data ?? null }));
  if (problems.length) return { problems, node: null };
  try {
    const node = await LessonBody({ hash: `preview:${body.length}:${hashString(body)}`, source: body, untrusted: true, diagrams: diagrams.data });
    return {
      problems: [],
      node: (
        <>
          {video?.success ? <LessonVideo key={hashString(JSON.stringify(video.data))} title={String(lesson.title ?? "")} scenes={playerScenes("preview", video.data, diagrams.data ?? {})} /> : null}
          {node}
        </>
      ),
    };
  } catch (err) {
    return { problems: [`MDX error: ${(err as Error).message}`], node: null };
  }
}

/** A first video script from the lesson's sections (the editor's "Draft from the lesson"). */
export async function draftVideoAction(lessonJson: string): Promise<{ ok: true; video: Record<string, unknown> } | { ok: false; problem: string }> {
  await requireAdmin();
  try {
    const l = JSON.parse(lessonJson) as Record<string, unknown>;
    const body = typeof l.body === "string" ? l.body : "";
    if (!body.trim()) return { ok: false, problem: "Write the lesson body first: the draft is made from its sections." };
    const diagrams = DiagramsSchema.safeParse(l.diagrams ?? {});
    const current = (l.video as { voice?: string } | undefined)?.voice;
    const voice = (NARRATION_VOICES as readonly string[]).includes(current ?? "") ? (current as NarrationVoice) : "af_heart";
    const video = draftVideo({ title: String(l.title ?? "") || "Lesson", summary: String(l.summary ?? "") || String(l.title ?? "Lesson"), body, diagrams: diagrams.success ? diagrams.data : {} }, voice);
    return { ok: true, video: video as unknown as Record<string, unknown> };
  } catch (err) {
    return { ok: false, problem: (err as Error).message };
  }
}

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const ItemRef = z.object({ type: TypeSchema, id: IdSchema });

function table(type: ItemType) {
  return type === "lesson" ? lessonTable : type === "question" ? questionTable : type === "quiz-mock" ? quizMockTable : labTable;
}

export async function setPublishedAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const { type, id } = ItemRef.parse({ type: form.get("type"), id: form.get("id") });
  const publish = form.get("publish") === "1";
  const item = await getItem(type, id);
  if (!item) redirect("/admin/content");
  if (publish && item.meta.knownIssue) redirect(`${editorPath(type, id)}?error=known-issue`);
  const t = table(type);
  await getDb().update(t).set({ published: publish, updatedAt: new Date() }).where(eq(t.id, id));
  await record(type, id, publish ? "published" : "unpublished", admin.id, null);
  refresh();
  redirect(`${editorPath(type, id)}?saved=${publish ? "published" : "unpublished"}`);
}

/** How many learners have used an item: an item with learner history is unpublished, not deleted. */
async function usage(type: ItemType, id: string): Promise<number> {
  const db = getDb();
  if (type === "lesson") return (await db.select({ n: count() }).from(lessonProgress).where(eq(lessonProgress.lessonId, id)))[0]?.n ?? 0;
  if (type === "question") return (await db.select({ n: count() }).from(answer).where(eq(answer.questionId, id)))[0]?.n ?? 0;
  if (type === "quiz-mock") return (await db.select({ n: count() }).from(quiz).where(eq(quiz.mockId, id)))[0]?.n ?? 0;
  return (await db.select({ n: count() }).from(labSession).where(eq(labSession.labId, id)))[0]?.n ?? 0;
}

export async function deleteItemAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const { type, id } = ItemRef.parse({ type: form.get("type"), id: form.get("id") });
  const item = await getItem(type, id);
  if (!item) redirect("/admin/content");
  if (item.meta.origin !== "app") redirect(`${editorPath(type, id)}?error=file-item`);
  if ((await usage(type, id)) > 0) redirect(`${editorPath(type, id)}?error=in-use`);
  const t = table(type);
  await getDb().delete(t).where(eq(t.id, id));
  await record(type, id, "deleted", admin.id, item.edit);
  refresh();
  redirect(`/admin/content?deleted=${encodeURIComponent(id)}`);
}

/** Undoes every app edit of an ingested item: back to its file version, and the ingest updates it again. */
export async function revertToFileAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const { type, id } = ItemRef.parse({ type: form.get("type"), id: form.get("id") });
  const fileVersion = await getFileVersion(type, id);
  const item = await getItem(type, id);
  if (!item || !fileVersion) redirect(item ? `${editorPath(type, id)}?error=no-file-version` : "/admin/content");
  const result = await check(type, fileVersion);
  if (!result.ok) redirect(`${editorPath(type, id)}?error=no-file-version`);
  await writeRow(type, result.value, { create: false, origin: "file" });
  await record(type, id, "reverted", admin.id, result.value);
  refresh();
  redirect(`${editorPath(type, id)}?saved=reverted`);
}

/** Restores an earlier saved version as a new edit (the history keeps both). */
export async function restoreRevisionAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const revisionId = z.coerce.number().int().positive().parse(form.get("revision"));
  const [rev] = await getDb().select().from(contentRevision).where(eq(contentRevision.id, revisionId));
  if (!rev?.snapshot) redirect("/admin/content");
  const type = rev.itemType;
  const item = await getItem(type, rev.itemId);
  const result = await check(type, rev.snapshot);
  if (!result.ok) redirect(`${editorPath(type, rev.itemId)}?error=restore-invalid`);
  if (item?.meta.origin === "file") await record(type, rev.itemId, "file-version", admin.id, item.edit);
  await writeRow(type, result.value, { create: !item, origin: "app" });
  await record(type, rev.itemId, "restored", admin.id, result.value);
  refresh();
  redirect(`${editorPath(type, rev.itemId)}?saved=restored`);
}
