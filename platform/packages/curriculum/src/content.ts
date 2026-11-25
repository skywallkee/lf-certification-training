import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import * as z from "zod";
import { KeySchema } from "./schema.ts";
import type { Curriculum } from "./load.ts";

/**
 * Lessons and question banks. Lessons are MDX files with YAML front matter under content/lessons;
 * question banks are YAML files under content/questions. Items marked `mock: true` are the Phase 1
 * sample set: they show a "Sample content" label in the app, live under a `sample/` folder, and the
 * ingest can leave them out (CONTENT_INCLUDE_SAMPLE=false) so they are removed in one step.
 */

const CompetencyRefSchema = z.string().regex(/^[a-z]{2,6}\/[a-z0-9-]+\/[a-z0-9-]+$/, "must be <cert>/<domain>/<competency>");

export const DocLinkSchema = z.strictObject({
  title: z.string().trim().min(1),
  url: z.url().refine((u) => u.startsWith("https://"), "must be an https URL"),
});

export const LessonFrontMatterSchema = z.strictObject({
  id: KeySchema,
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(280),
  minutes: z.int().min(1).max(120),
  competencies: z.array(CompetencyRefSchema).min(1),
  docs: z.array(DocLinkSchema).default([]),
  mock: z.boolean().default(false),
});

export const QuestionOptionSchema = z.strictObject({
  id: z.string().regex(/^[a-z]$/, "option ids are single lowercase letters"),
  text: z.string().trim().min(1),
  correct: z.boolean().default(false),
});

export const QuestionSchema = z
  .strictObject({
    id: KeySchema,
    kind: z.enum(["single", "multiple"]),
    competencies: z.array(CompetencyRefSchema).min(1),
    /** Markdown: inline code and fenced code blocks are allowed. */
    stem: z.string().trim().min(1),
    options: z.array(QuestionOptionSchema).min(2).max(6),
    explanation: z.string().trim().min(1),
    source: DocLinkSchema,
    /**
     * A known problem with the item. The sample set uses it for one deliberately broken question so the
     * admin flag queue has something in it; the ingest opens a flag for every item that has one.
     */
    knownIssue: z.string().trim().min(1).optional(),
  })
  .superRefine((q, ctx) => {
    const ids = q.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["options"], message: "duplicate option id" });
    const correct = q.options.filter((o) => o.correct).length;
    if (q.kind === "single" && correct !== 1 && !q.knownIssue) {
      ctx.addIssue({ code: "custom", path: ["options"], message: `single-answer question needs exactly 1 correct option, has ${correct}` });
    }
    if (q.kind === "multiple" && correct < 2 && !q.knownIssue) {
      ctx.addIssue({ code: "custom", path: ["options"], message: `multiple-answer question needs at least 2 correct options, has ${correct}` });
    }
  });

export const QuestionBankSchema = z.strictObject({
  mock: z.boolean().default(false),
  questions: z.array(QuestionSchema).min(1),
});

/**
 * Hands-on labs (Phase 2). One YAML file per lab under content/labs. A lab is a set of tasks on a fresh
 * cluster; each task has graded checks. A check is either a Chainsaw assertion tree (`assert`), matched
 * against the cluster by the grader, or a shell script (`script`) that passes when it exits 0. Checks run in
 * a grader container the learner cannot reach (`runIn: grader`), or inside the learner's workstation for
 * files they were asked to write (`runIn: workstation`). The reference `solution` is a shell script run in
 * the workstation; the lab self-test applies it and expects every check to pass.
 */
export const LabCheckSchema = z
  .strictObject({
    id: KeySchema,
    /** What the check verifies, written as the passing state: "Deployment web has 3 ready replicas". */
    description: z.string().trim().min(1).max(200),
    /** Shown when the check fails, to say what is wrong without giving the answer away. */
    failMessage: z.string().trim().min(1).max(300).optional(),
    assert: z.record(z.string(), z.unknown()).optional(),
    /** Namespace for an `assert` on a namespaced resource whose tree has no metadata.namespace. */
    namespace: KeySchema.optional(),
    script: z.string().trim().min(1).optional(),
    runIn: z.enum(["grader", "workstation"]).default("grader"),
  })
  .superRefine((c, ctx) => {
    if (Boolean(c.assert) === Boolean(c.script)) {
      ctx.addIssue({ code: "custom", message: "a check needs exactly one of assert or script" });
    }
    if (c.assert && c.runIn === "workstation") {
      ctx.addIssue({ code: "custom", path: ["runIn"], message: "assert checks always run in the grader" });
    }
  });

export const LabTaskSchema = z.strictObject({
  id: KeySchema,
  title: z.string().trim().min(1).max(120),
  /** Share of the lab score, in percent. Task weights add up to 100. */
  weight: z.int().min(1).max(100),
  /** Markdown task text, as the learner reads it. */
  body: z.string().trim().min(1),
  /** Up to three progressive hints; using one is recorded. */
  hints: z.array(z.string().trim().min(1)).max(3).default([]),
  /** The cluster this task is about (one of the lab's `clusters`). Required when the lab has more than one. */
  cluster: z.string().optional(),
  checks: z.array(LabCheckSchema).min(1),
});

/** A cluster name: also its kubectl context and its host name on the lab network. */
export const ClusterNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,15}$/, "must be a short lowercase name (letters, digits, hyphens)")
  .refine((n) => !["grader", "workstation", "localhost"].includes(n), "is reserved");

export const LabSchema = z
  .strictObject({
    id: KeySchema,
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(280),
    /** 1: virtual cluster sized (k3s), 2: kubeadm VMs, 3: Linux VM. Phase 2 runs tier 1 only. */
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** Session length: the timer the learner sees. */
    minutes: z.int().min(5).max(240),
    competencies: z.array(CompetencyRefSchema).min(1),
    docs: z.array(DocLinkSchema).default([]),
    /**
     * Clusters to boot, 1 to 3. Each is a kubectl context on the workstation; with more than one, every task
     * names its cluster and the learner switches context per task, as in the exams.
     */
    clusters: z.array(ClusterNameSchema).min(1).max(3).default(["k8s"]),
    /** Container images the tasks need, loaded into every cluster before the learner starts. */
    images: z.array(z.string().regex(/^[a-z0-9./_:-]+$/, "must be an image reference")).default([]),
    /**
     * Shell run once in the grader with cluster-admin rights before the terminal opens. Every cluster is a
     * context (`kubectl --context <name>`); the first one is the current context.
     */
    setup: z.string().trim().min(1).optional(),
    /** Reference solution, run in the workstation by the self-test, shown to the learner after the lab. */
    solution: z.string().trim().min(1),
    tasks: z.array(LabTaskSchema).min(1),
    mock: z.boolean().default(false),
  })
  .superRefine((lab, ctx) => {
    const total = lab.tasks.reduce((sum, t) => sum + t.weight, 0);
    if (total !== 100) ctx.addIssue({ code: "custom", path: ["tasks"], message: `task weights must add up to 100, they add up to ${total}` });
    const taskIds = lab.tasks.map((t) => t.id);
    if (new Set(taskIds).size !== taskIds.length) ctx.addIssue({ code: "custom", path: ["tasks"], message: "duplicate task id" });
    const checkIds = lab.tasks.flatMap((t) => t.checks.map((c) => c.id));
    if (new Set(checkIds).size !== checkIds.length) ctx.addIssue({ code: "custom", path: ["tasks"], message: "duplicate check id" });
    if (new Set(lab.clusters).size !== lab.clusters.length) ctx.addIssue({ code: "custom", path: ["clusters"], message: "duplicate cluster name" });
    lab.tasks.forEach((t, i) => {
      if (t.cluster !== undefined && !lab.clusters.includes(t.cluster)) {
        ctx.addIssue({ code: "custom", path: ["tasks", i, "cluster"], message: `"${t.cluster}" is not one of the lab's clusters (${lab.clusters.join(", ")})` });
      }
      if (t.cluster === undefined && lab.clusters.length > 1) {
        ctx.addIssue({ code: "custom", path: ["tasks", i, "cluster"], message: "required when the lab has more than one cluster" });
      }
    });
  });

export type LabInput = z.infer<typeof LabSchema>;
export type LabTask = z.infer<typeof LabTaskSchema>;
export type LabCheck = z.infer<typeof LabCheckSchema>;

export type DocLink = z.infer<typeof DocLinkSchema>;
export type QuestionInput = z.infer<typeof QuestionSchema>;

export interface Lesson extends z.infer<typeof LessonFrontMatterSchema> {
  /** Cert code of the first competency: the cert the lesson belongs to. */
  cert: string;
  /** MDX body without the front matter. */
  body: string;
  /** Path relative to content/. */
  file: string;
  hash: string;
}

export interface Question extends QuestionInput {
  cert: string;
  mock: boolean;
  file: string;
  hash: string;
}

export interface Lab extends LabInput {
  cert: string;
  file: string;
  hash: string;
}

export interface Content {
  lessons: Lesson[];
  questions: Question[];
  labs: Lab[];
}

export class ContentError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Content is invalid:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ContentError";
  }
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

async function walk(dir: string, ext: RegExp): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full, ext)));
    else if (ext.test(entry.name)) files.push(full);
  }
  return files;
}

function hashOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function certOf(ref: string): string {
  return (ref.split("/")[0] ?? "").toUpperCase();
}

export interface LoadContentOptions {
  /** Include items marked `mock: true` (default true). Production sets CONTENT_INCLUDE_SAMPLE=false once real content exists. */
  includeSample?: boolean;
}

/** Loads and validates lessons, question banks and labs against the curriculum. Throws ContentError listing every problem. */
export async function loadContent(curriculum: Curriculum, opts: LoadContentOptions = {}): Promise<Content> {
  const includeSample = opts.includeSample ?? true;
  const problems: string[] = [];
  const lessons: Lesson[] = [];
  const questions: Question[] = [];
  const labs: Lab[] = [];
  const rel = (full: string) => path.relative(curriculum.contentDir, full).split(path.sep).join("/");
  const checkRefs = (file: string, where: string, refs: string[]) => {
    for (const ref of refs) {
      if (!curriculum.competencies.has(ref)) problems.push(`${file}: ${where}: unknown competency "${ref}"`);
    }
  };

  const lessonIds = new Set<string>();
  for (const full of await walk(path.join(curriculum.contentDir, "lessons"), /\.mdx$/)) {
    const file = rel(full);
    const text = await readFile(full, "utf8");
    const fm = FRONT_MATTER.exec(text);
    if (!fm) {
      problems.push(`${file}: missing YAML front matter`);
      continue;
    }
    const parsed = LessonFrontMatterSchema.safeParse(parse(fm[1] ?? ""));
    if (!parsed.success) {
      problems.push(...parsed.error.issues.map((i) => `${file}: ${i.path.join(".") || "(front matter)"}: ${i.message}`));
      continue;
    }
    const meta = parsed.data;
    if (lessonIds.has(meta.id)) problems.push(`${file}: duplicate lesson id ${meta.id}`);
    lessonIds.add(meta.id);
    checkRefs(file, "competencies", meta.competencies);
    if (meta.mock && !file.includes("/sample/")) problems.push(`${file}: mock lessons belong under a sample/ folder`);
    if (!meta.mock && file.includes("/sample/")) problems.push(`${file}: files under sample/ must set mock: true`);
    const body = text.slice(fm[0].length).trim();
    if (body.length === 0) problems.push(`${file}: empty lesson body`);
    if (!includeSample && meta.mock) continue;
    const cert = certOf(meta.competencies[0]!);
    lessons.push({ ...meta, cert, body, file, hash: hashOf({ meta, body }) });
  }

  const questionIds = new Set<string>();
  for (const full of await walk(path.join(curriculum.contentDir, "questions"), /\.ya?ml$/)) {
    const file = rel(full);
    let raw: unknown;
    try {
      raw = parse(await readFile(full, "utf8"));
    } catch (err) {
      problems.push(`${file}: YAML parse error: ${(err as Error).message}`);
      continue;
    }
    const parsed = QuestionBankSchema.safeParse(raw);
    if (!parsed.success) {
      problems.push(...parsed.error.issues.map((i) => `${file}: ${i.path.join(".") || "(root)"}: ${i.message}`));
      continue;
    }
    const bank = parsed.data;
    if (bank.mock && !file.includes("/sample/")) problems.push(`${file}: mock question banks belong under a sample/ folder`);
    if (!bank.mock && file.includes("/sample/")) problems.push(`${file}: files under sample/ must set mock: true`);
    for (const [i, q] of bank.questions.entries()) {
      if (questionIds.has(q.id)) problems.push(`${file}: questions.${i}: duplicate question id ${q.id}`);
      questionIds.add(q.id);
      checkRefs(file, `questions.${i}.competencies`, q.competencies);
      if (!includeSample && bank.mock) continue;
      questions.push({ ...q, cert: certOf(q.competencies[0]!), mock: bank.mock, file, hash: hashOf(q) });
    }
  }

  const labIds = new Set<string>();
  for (const full of await walk(path.join(curriculum.contentDir, "labs"), /\.ya?ml$/)) {
    const file = rel(full);
    let raw: unknown;
    try {
      raw = parse(await readFile(full, "utf8"));
    } catch (err) {
      problems.push(`${file}: YAML parse error: ${(err as Error).message}`);
      continue;
    }
    const parsed = LabSchema.safeParse(raw);
    if (!parsed.success) {
      problems.push(...parsed.error.issues.map((i) => `${file}: ${i.path.join(".") || "(root)"}: ${i.message}`));
      continue;
    }
    const lab = parsed.data;
    if (labIds.has(lab.id)) problems.push(`${file}: duplicate lab id ${lab.id}`);
    labIds.add(lab.id);
    checkRefs(file, "competencies", lab.competencies);
    if (lab.mock && !file.includes("/sample/")) problems.push(`${file}: mock labs belong under a sample/ folder`);
    if (!lab.mock && file.includes("/sample/")) problems.push(`${file}: files under sample/ must set mock: true`);
    if (!includeSample && lab.mock) continue;
    labs.push({ ...lab, cert: certOf(lab.competencies[0]!), file, hash: hashOf(lab) });
  }

  if (problems.length > 0) throw new ContentError(problems);
  return { lessons, questions, labs };
}
