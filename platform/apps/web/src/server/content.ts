import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  certOfItem,
  hashOfItem,
  type AuthoringContext,
  type ItemType,
  type LabEdit,
  type LessonEdit,
  type QuestionEdit,
  type QuizMockEdit,
} from "@lfct/curriculum";
import { lab as labTable, lesson as lessonTable, question as questionTable, quizMock as quizMockTable } from "@lfct/curriculum/db";
import { getDb } from "@/db";
import { contentRevision, user as userTable } from "@/db/schema";
import { getCatalog } from "./catalog";

/**
 * The admin content editor's view of the content tables: rows to editor JSON (the content file format) and
 * back. Labs and mock exams share the lab table and differ by kind.
 */

export type LessonRow = typeof lessonTable.$inferSelect;
export type QuestionRow = typeof questionTable.$inferSelect;
export type LabRow = typeof labTable.$inferSelect;
export type QuizMockRow = typeof quizMockTable.$inferSelect;
export type ItemEdit = LessonEdit | QuestionEdit | LabEdit | QuizMockEdit;

export const TYPE_LABEL: Record<ItemType, { one: string; many: string }> = {
  lesson: { one: "lesson", many: "Lessons" },
  question: { one: "question", many: "Questions" },
  lab: { one: "lab", many: "Labs" },
  mock: { one: "practical mock exam", many: "Practical mocks" },
  "quiz-mock": { one: "multiple-choice mock", many: "Multiple-choice mocks" },
};

export function isItemType(value: string): value is ItemType {
  return value === "lesson" || value === "question" || value === "lab" || value === "mock" || value === "quiz-mock";
}

export async function authoringContext(): Promise<AuthoringContext> {
  const catalog = await getCatalog();
  return { competencies: new Set(catalog.competencies.keys()), certs: catalog.certs };
}

export function lessonEditOf(row: LessonRow): LessonEdit {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    minutes: row.minutes,
    competencies: row.competencyRefs,
    docs: row.docs,
    mock: row.mock,
    diagrams: row.diagrams ?? {},
    ...(row.video ? { video: row.video } : {}),
    body: row.body,
  };
}

export function questionEditOf(row: QuestionRow): QuestionEdit {
  return {
    id: row.id,
    kind: row.kind,
    competencies: row.competencyRefs,
    stem: row.stem,
    options: row.options,
    explanation: row.explanation,
    source: { title: row.sourceTitle, url: row.sourceUrl },
    ...(row.knownIssue ? { knownIssue: row.knownIssue } : {}),
    mock: row.mock,
  };
}

export function labEditOf(row: LabRow): LabEdit {
  const single = row.clusters.length === 1;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    tier: row.tier as 1 | 2 | 3,
    minutes: row.minutes,
    competencies: row.competencyRefs,
    docs: row.docs,
    clusters: row.clusters,
    images: row.images,
    ...(row.setup ? { setup: row.setup } : {}),
    solution: row.solution,
    // The ingest fills in the cluster of single-cluster labs; leave it out again so the file stays short.
    tasks: row.tasks.map(({ cluster, ...t }) => ({ ...t, ...(single ? {} : { cluster }) })),
    ...(row.passPercent !== null ? { passPercent: row.passPercent } : {}),
    mock: row.mock,
  };
}

export function quizMockEditOf(row: QuizMockRow): QuizMockEdit {
  return {
    format: "multiple-choice",
    id: row.id,
    title: row.title,
    summary: row.summary,
    cert: row.certCode,
    minutes: row.minutes,
    questionCount: row.questionCount,
    passPercent: row.passPercent,
    ...(row.questionIds ? { questions: row.questionIds } : {}),
    mock: row.mock,
  };
}

/** Column values for an edited item, as the ingest writes them (see @lfct/curriculum ingestContent). */
export function lessonValues(l: LessonEdit) {
  const { body, ...meta } = l;
  return {
    certCode: certOfItem(l),
    title: l.title,
    summary: l.summary,
    minutes: l.minutes,
    body,
    docs: l.docs,
    diagrams: l.diagrams,
    video: l.video ?? null,
    competencyRefs: l.competencies,
    mock: l.mock,
    contentHash: hashOfItem({ meta, body }),
  };
}

export function questionValues(q: QuestionEdit) {
  const { mock, ...rest } = q;
  return {
    certCode: certOfItem(q),
    kind: q.kind,
    stem: q.stem,
    options: q.options.map((o) => ({ id: o.id, text: o.text, correct: o.correct })),
    explanation: q.explanation,
    sourceTitle: q.source.title,
    sourceUrl: q.source.url,
    competencyRefs: q.competencies,
    mock,
    knownIssue: q.knownIssue ?? null,
    contentHash: hashOfItem(rest),
  };
}

export function labValues(l: LabEdit, kind: "lab" | "mock") {
  return {
    certCode: certOfItem(l),
    title: l.title,
    summary: l.summary,
    tier: l.tier,
    minutes: l.minutes,
    docs: l.docs,
    clusters: l.clusters,
    images: l.images,
    setup: l.setup ?? null,
    solution: l.solution,
    tasks: l.tasks.map((t) => ({ ...t, cluster: t.cluster ?? l.clusters[0]! })),
    competencyRefs: l.competencies,
    kind,
    passPercent: l.passPercent ?? null,
    mock: l.mock,
    contentHash: hashOfItem(l),
  };
}

export function quizMockValues(m: QuizMockEdit) {
  return {
    certCode: m.cert,
    title: m.title,
    summary: m.summary,
    minutes: m.minutes,
    questionCount: m.questionCount,
    passPercent: m.passPercent,
    questionIds: m.questions ?? null,
    mock: m.mock,
    contentHash: hashOfItem(m),
  };
}

export interface ItemMeta {
  type: ItemType;
  id: string;
  title: string;
  certCode: string;
  origin: "file" | "app";
  published: boolean;
  mock: boolean;
  file: string;
  knownIssue: boolean;
  updatedAt: Date;
}

export interface LoadedItem {
  meta: ItemMeta;
  edit: ItemEdit;
}

function firstLine(markdown: string, max = 110): string {
  const line = markdown.replace(/```[\s\S]*?```/g, " ").replace(/[`*_#>]/g, "").replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** One item for the editor, or null. */
export async function getItem(type: ItemType, id: string): Promise<LoadedItem | null> {
  const db = getDb();
  if (type === "lesson") {
    const [row] = await db.select().from(lessonTable).where(eq(lessonTable.id, id));
    return row ? { meta: { type, id, title: row.title, certCode: row.certCode, origin: row.origin, published: row.published, mock: row.mock, file: row.file, knownIssue: false, updatedAt: row.updatedAt }, edit: lessonEditOf(row) } : null;
  }
  if (type === "question") {
    const [row] = await db.select().from(questionTable).where(eq(questionTable.id, id));
    return row
      ? { meta: { type, id, title: firstLine(row.stem), certCode: row.certCode, origin: row.origin, published: row.published, mock: row.mock, file: row.file, knownIssue: Boolean(row.knownIssue), updatedAt: row.updatedAt }, edit: questionEditOf(row) }
      : null;
  }
  if (type === "quiz-mock") {
    const [row] = await db.select().from(quizMockTable).where(eq(quizMockTable.id, id));
    return row ? { meta: { type, id, title: row.title, certCode: row.certCode, origin: row.origin, published: row.published, mock: row.mock, file: row.file, knownIssue: false, updatedAt: row.updatedAt }, edit: quizMockEditOf(row) } : null;
  }
  const [row] = await db.select().from(labTable).where(and(eq(labTable.id, id), eq(labTable.kind, type)));
  return row ? { meta: { type, id, title: row.title, certCode: row.certCode, origin: row.origin, published: row.published, mock: row.mock, file: row.file, knownIssue: false, updatedAt: row.updatedAt }, edit: labEditOf(row) } : null;
}

/** True when any content table already uses this id for this type (labs and both kinds of mock exam share one id space). */
export async function idTaken(type: ItemType, id: string): Promise<boolean> {
  const db = getDb();
  if (type === "lesson") return (await db.select({ id: lessonTable.id }).from(lessonTable).where(eq(lessonTable.id, id))).length > 0;
  if (type === "question") return (await db.select({ id: questionTable.id }).from(questionTable).where(eq(questionTable.id, id))).length > 0;
  const [labs, quizMocks] = await Promise.all([
    db.select({ id: labTable.id }).from(labTable).where(eq(labTable.id, id)),
    db.select({ id: quizMockTable.id }).from(quizMockTable).where(eq(quizMockTable.id, id)),
  ]);
  return labs.length + quizMocks.length > 0;
}

/** Every item of every type, for the content list. Small (hundreds of rows), so filtered in memory. */
export async function listItems(): Promise<ItemMeta[]> {
  const db = getDb();
  const [lessons, questions, labs, quizMocks] = await Promise.all([
    db
      .select({ id: lessonTable.id, title: lessonTable.title, certCode: lessonTable.certCode, origin: lessonTable.origin, published: lessonTable.published, mock: lessonTable.mock, file: lessonTable.file, updatedAt: lessonTable.updatedAt })
      .from(lessonTable)
      .orderBy(asc(lessonTable.certCode), asc(lessonTable.title)),
    db
      .select({ id: questionTable.id, stem: questionTable.stem, certCode: questionTable.certCode, origin: questionTable.origin, published: questionTable.published, mock: questionTable.mock, file: questionTable.file, knownIssue: questionTable.knownIssue, updatedAt: questionTable.updatedAt })
      .from(questionTable)
      .orderBy(asc(questionTable.certCode), asc(questionTable.id)),
    db
      .select({ id: labTable.id, title: labTable.title, kind: labTable.kind, certCode: labTable.certCode, origin: labTable.origin, published: labTable.published, mock: labTable.mock, file: labTable.file, updatedAt: labTable.updatedAt })
      .from(labTable)
      .orderBy(asc(labTable.certCode), asc(labTable.title)),
    db
      .select({ id: quizMockTable.id, title: quizMockTable.title, certCode: quizMockTable.certCode, origin: quizMockTable.origin, published: quizMockTable.published, mock: quizMockTable.mock, file: quizMockTable.file, updatedAt: quizMockTable.updatedAt })
      .from(quizMockTable)
      .orderBy(asc(quizMockTable.certCode), asc(quizMockTable.title)),
  ]);
  return [
    ...lessons.map((l) => ({ ...l, type: "lesson" as const, knownIssue: false })),
    ...questions.map(({ stem, knownIssue, ...q }) => ({ ...q, type: "question" as const, title: firstLine(stem), knownIssue: Boolean(knownIssue) })),
    ...labs.map(({ kind, ...l }) => ({ ...l, type: kind, knownIssue: false })),
    ...quizMocks.map((m) => ({ ...m, type: "quiz-mock" as const, knownIssue: false })),
  ];
}

export interface Revision {
  id: number;
  action: string;
  createdAt: Date;
  by: string | null;
  hasSnapshot: boolean;
}

export async function getRevisions(type: ItemType, id: string, limit = 20): Promise<Revision[]> {
  const rows = await getDb()
    .select({ id: contentRevision.id, action: contentRevision.action, createdAt: contentRevision.createdAt, by: userTable.email, snapshot: contentRevision.snapshot })
    .from(contentRevision)
    .leftJoin(userTable, eq(userTable.id, contentRevision.userId))
    .where(and(eq(contentRevision.itemType, type), eq(contentRevision.itemId, id)))
    .orderBy(desc(contentRevision.id))
    .limit(limit);
  return rows.map(({ snapshot, ...r }) => ({ ...r, hasSnapshot: snapshot !== null }));
}

/** The item as it was in its file before the first edit in the app, kept so the edit can be undone. */
export async function getFileVersion(type: ItemType, id: string): Promise<Record<string, unknown> | null> {
  const [row] = await getDb()
    .select({ snapshot: contentRevision.snapshot })
    .from(contentRevision)
    .where(and(eq(contentRevision.itemType, type), eq(contentRevision.itemId, id), eq(contentRevision.action, "file-version")))
    .orderBy(desc(contentRevision.id))
    .limit(1);
  return row?.snapshot ?? null;
}

/** Certs with their domains and competencies, for the editor's competency picker. */
export async function certOptions() {
  const catalog = await getCatalog();
  return [...catalog.certs.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((c) => ({
      code: c.code,
      name: c.name,
      examStyle: c.examStyle,
      domains: c.domains.map((d) => ({ key: d.key, name: d.name, competencies: d.competencies.map((x) => ({ ref: x.ref, statement: x.statement })) })),
    }));
}

/** A starting point for a new item: valid in shape, with the blanks an admin fills in. Sample content by default. */
export function newItemTemplate(type: ItemType): Record<string, unknown> {
  if (type === "lesson") {
    return { id: "", title: "", summary: "", minutes: 10, competencies: [], docs: [], mock: true, body: "## Overview\n\nWrite the lesson here.\n" };
  }
  if (type === "question") {
    return {
      id: "",
      kind: "single",
      competencies: [],
      stem: "",
      options: [
        { id: "a", text: "", correct: true },
        { id: "b", text: "", correct: false },
        { id: "c", text: "", correct: false },
        { id: "d", text: "", correct: false },
      ],
      explanation: "",
      source: { title: "", url: "https://kubernetes.io/docs/" },
      mock: true,
    };
  }
  if (type === "quiz-mock") {
    return { format: "multiple-choice", id: "", title: "", summary: "", cert: "KCNA", minutes: 90, questionCount: 60, passPercent: 75, mock: true };
  }
  const task = (n: number, weight: number) => ({
    id: `task-${n}`,
    title: "",
    weight,
    body: "",
    ...(type === "lab" ? { hints: [] } : {}),
    checks: [{ id: `task-${n}-check`, description: "", script: "kubectl get pods" }],
  });
  return {
    id: "",
    title: "",
    summary: "",
    tier: 1,
    minutes: type === "mock" ? 120 : 30,
    competencies: [],
    docs: [],
    clusters: ["k8s"],
    images: [],
    solution: "# commands that solve every task\n",
    tasks: type === "mock" ? [task(1, 25), task(2, 25), task(3, 25), task(4, 25)] : [task(1, 100)],
    ...(type === "mock" ? { passPercent: 66 } : {}),
    mock: true,
  };
}
