import { createHash } from "node:crypto";
import { parse, stringify } from "yaml";
import * as z from "zod";
import {
  LabSchema,
  LessonFrontMatterSchema,
  QuestionSchema,
  mockProblems,
  type LabInput,
  type QuestionInput,
} from "./content.ts";

/**
 * Content authoring in the app (admin editor). An item is edited as the same JSON the content files hold, and
 * validated with the same zod schemas as the ingest, so the file format stays defined in one place
 * (content.ts) and the editor follows it when it changes. Items can be exported back to their file format
 * (MDX with front matter, or YAML) and committed under content/.
 */

export type ItemType = "lesson" | "question" | "lab" | "mock";
export const ITEM_TYPES: readonly ItemType[] = ["lesson", "question", "lab", "mock"];

export const LessonEditSchema = LessonFrontMatterSchema.extend({
  /** MDX body without front matter. */
  body: z.string().trim().min(1, "the lesson body is empty"),
});
export type LessonEdit = z.infer<typeof LessonEditSchema>;

export type QuestionEdit = QuestionInput & { mock: boolean };
export type LabEdit = LabInput;

export type Validated<T> = { ok: true; value: T } | { ok: false; problems: string[] };

export interface AuthoringContext {
  /** Competency refs of the current curricula: lessons, questions and labs must reference these. */
  competencies: ReadonlySet<string>;
}

function issues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".") || "(item)"}: ${i.message}`);
}

function refProblems(ctx: AuthoringContext, where: string, refs: readonly string[]): string[] {
  return refs.filter((r) => !ctx.competencies.has(r)).map((r) => `${where}: unknown competency "${r}"`);
}

export function validateLesson(input: unknown, ctx: AuthoringContext): Validated<LessonEdit> {
  const parsed = LessonEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, problems: issues(parsed.error) };
  const problems = refProblems(ctx, "competencies", parsed.data.competencies);
  return problems.length ? { ok: false, problems } : { ok: true, value: parsed.data };
}

const QuestionEditSchema = z.object({ mock: z.boolean().default(false) }).loose();

export function validateQuestion(input: unknown, ctx: AuthoringContext): Validated<QuestionEdit> {
  const flags = QuestionEditSchema.safeParse(input);
  if (!flags.success) return { ok: false, problems: issues(flags.error) };
  const { mock: _mock, ...rest } = input as Record<string, unknown>;
  const parsed = QuestionSchema.safeParse(rest);
  if (!parsed.success) return { ok: false, problems: issues(parsed.error) };
  const problems = refProblems(ctx, "competencies", parsed.data.competencies);
  return problems.length ? { ok: false, problems } : { ok: true, value: { ...parsed.data, mock: flags.data.mock } };
}

/** Labs and mock exams share a format; a mock exam has the extra rules of mockProblems. */
export function validateLab(input: unknown, kind: "lab" | "mock", ctx: AuthoringContext): Validated<LabEdit> {
  const parsed = LabSchema.safeParse(input);
  if (!parsed.success) return { ok: false, problems: issues(parsed.error) };
  const lab = parsed.data;
  const problems = refProblems(ctx, "competencies", lab.competencies);
  lab.tasks.forEach((t, i) => t.competency && problems.push(...refProblems(ctx, `tasks.${i}.competency`, [t.competency])));
  if (kind === "mock") problems.push(...mockProblems(lab));
  else if (lab.passPercent !== undefined) problems.push("passPercent: only mock exams have a pass mark");
  return problems.length ? { ok: false, problems } : { ok: true, value: lab };
}

export function validateItem(type: ItemType, input: unknown, ctx: AuthoringContext): Validated<LessonEdit | QuestionEdit | LabEdit> {
  if (type === "lesson") return validateLesson(input, ctx);
  if (type === "question") return validateQuestion(input, ctx);
  return validateLab(input, type, ctx);
}

/** The cert an item belongs to: the cert of its first competency, upper case. */
export function certOfItem(item: { competencies: readonly string[] }): string {
  return (item.competencies[0]?.split("/")[0] ?? "").toUpperCase();
}

export function hashOfItem(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

// ---------- File format: what an item looks like under content/ ----------

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Drops undefined values and empty optional lists so the exported YAML stays as short as a hand-written file. */
function tidy<T extends Record<string, unknown>>(obj: T, dropEmpty: readonly string[] = []): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (dropEmpty.includes(k) && Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

const yamlOptions = { lineWidth: 0 } as const;

/** A lesson as an MDX file: YAML front matter, then the body. */
export function lessonToSource(lesson: LessonEdit): string {
  const { body, ...meta } = lesson;
  return `---\n${stringify(tidy(meta, ["docs"]), yamlOptions)}---\n\n${body.trim()}\n`;
}

/** Parses an MDX lesson file back into editor JSON (not validated). */
export function lessonFromSource(source: string): unknown {
  const fm = FRONT_MATTER.exec(source);
  if (!fm) throw new Error("missing YAML front matter (a --- block at the top)");
  const meta: unknown = parse(fm[1] ?? "");
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) throw new Error("the front matter must be a YAML mapping");
  return { ...meta, body: source.slice(fm[0].length).trim() };
}

/** A question as a one-question bank file (content/questions/<name>.yaml). */
export function questionToSource(q: QuestionEdit): string {
  const { mock, ...rest } = q;
  return stringify({ mock, questions: [tidy(rest)] }, yamlOptions);
}

/** Parses a question: either a bank with one question, or the bare question mapping. */
export function questionFromSource(source: string): unknown {
  const raw: unknown = parse(source);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("expected a YAML mapping");
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.questions)) {
    if (obj.questions.length !== 1) throw new Error("the editor takes one question at a time");
    return { ...(obj.questions[0] as object), mock: obj.mock ?? false };
  }
  return obj;
}

export function labToSource(lab: LabEdit): string {
  const tasks = lab.tasks.map((t) => tidy({ ...t, checks: t.checks.map((c) => tidy(c)) }, ["hints"]));
  return stringify(tidy({ ...lab, tasks }, ["docs", "images"]), yamlOptions);
}

export function labFromSource(source: string): unknown {
  const raw: unknown = parse(source);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("expected a YAML mapping");
  return raw;
}

export function itemToSource(type: ItemType, item: unknown): string {
  if (type === "lesson") return lessonToSource(item as LessonEdit);
  if (type === "question") return questionToSource(item as QuestionEdit);
  return labToSource(item as LabEdit);
}

export function itemFromSource(type: ItemType, source: string): unknown {
  if (type === "lesson") return lessonFromSource(source);
  if (type === "question") return questionFromSource(source);
  return labFromSource(source);
}

/** Where the exported file goes in the repository, so it can be committed as is. */
export function exportPath(type: ItemType, item: { id: string; mock: boolean; competencies: readonly string[] }): string {
  const cert = certOfItem(item).toLowerCase();
  const sample = item.mock ? "sample/" : "";
  if (type === "lesson") return `content/lessons/${sample}${cert}/${item.id}.mdx`;
  if (type === "question") return `content/questions/${sample}${cert}-${item.id}.yaml`;
  return `content/${type === "mock" ? "mocks" : "labs"}/${sample}${cert}/${item.id}.yaml`;
}
