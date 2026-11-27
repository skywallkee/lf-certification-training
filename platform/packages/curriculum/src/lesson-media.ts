import { createHash } from "node:crypto";
import * as z from "zod";
import { KeySchema } from "./schema.ts";

/**
 * The rich parts of a lesson that live in its front matter as data: diagrams (drawn by the app, placed in the body
 * with <Diagram id="..." />) and the lesson video (scenes with narration and an animated visual each). Keeping them
 * as data means the written lesson and the video share one source: a video scene shows the same diagram the body
 * shows, and the editor can check both. See content/README.md ("Rich lessons") and ADR 0023.
 */

// ---------- Diagrams ----------

export const DIAGRAM_ICONS = [
  "pod",
  "service",
  "deployment",
  "replicaset",
  "node",
  "control-plane",
  "user",
  "container",
  "volume",
  "config",
  "secret",
  "ingress",
  "gateway",
  "dns",
  "proxy",
  "policy",
  "database",
  "internet",
  "cluster",
  "file",
  "process",
  "generic",
] as const;
export type DiagramIcon = (typeof DIAGRAM_ICONS)[number];

export const DIAGRAM_TONES = ["default", "primary", "success", "warning", "muted"] as const;

const DiagramNodeSchema = z.strictObject({
  id: KeySchema,
  /** Up to about 18 characters fit the box; longer labels are squeezed. */
  label: z.string().trim().min(1).max(32),
  /** A second, smaller line: an address, a port, a count. About 20 characters fit. */
  sub: z.string().trim().min(1).max(36).optional(),
  icon: z.enum(DIAGRAM_ICONS).default("generic"),
  /** Grid position: column 0 is the left edge, row 0 the top. */
  col: z.int().min(0).max(7),
  row: z.int().min(0).max(7),
  tone: z.enum(DIAGRAM_TONES).default("default"),
});

const DiagramEdgeSchema = z.strictObject({
  /** Optional: defaults to "<from>-<to>". Video steps refer to edges by this id. */
  id: KeySchema.optional(),
  from: KeySchema,
  to: KeySchema,
  label: z.string().trim().min(1).max(40).optional(),
  dashed: z.boolean().default(false),
  /** Draw an arrow head at both ends. */
  both: z.boolean().default(false),
});

const DiagramGroupSchema = z.strictObject({
  id: KeySchema,
  label: z.string().trim().min(1).max(40),
  /** The group's box is drawn around these nodes. */
  nodes: z.array(KeySchema).min(1),
});

export const DiagramSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  /** Shown under the diagram. */
  caption: z.string().trim().min(1).max(400).optional(),
  nodes: z.array(DiagramNodeSchema).min(1).max(24),
  edges: z.array(DiagramEdgeSchema).max(40).default([]),
  groups: z.array(DiagramGroupSchema).max(8).default([]),
});
export type Diagram = z.infer<typeof DiagramSchema>;
export type DiagramNode = Diagram["nodes"][number];
export type DiagramEdge = Diagram["edges"][number];

export const DiagramsSchema = z.record(KeySchema, DiagramSchema).default({});
export type Diagrams = Record<string, Diagram>;

export function edgeId(e: Pick<DiagramEdge, "id" | "from" | "to">): string {
  return e.id ?? `${e.from}-${e.to}`;
}

/** Every id a video step may name in a diagram: nodes, edges and groups. */
export function diagramElementIds(d: Diagram): Set<string> {
  return new Set([...d.nodes.map((n) => n.id), ...d.edges.map(edgeId), ...d.groups.map((g) => g.id)]);
}

export function diagramProblems(id: string, d: Diagram): string[] {
  const where = `diagrams.${id}`;
  const problems: string[] = [];
  const nodes = new Set<string>();
  const cells = new Set<string>();
  for (const n of d.nodes) {
    if (nodes.has(n.id)) problems.push(`${where}: duplicate node id ${n.id}`);
    nodes.add(n.id);
    const cell = `${n.col},${n.row}`;
    if (cells.has(cell)) problems.push(`${where}: nodes overlap at col ${n.col}, row ${n.row}`);
    cells.add(cell);
  }
  const all = new Set(nodes);
  for (const e of d.edges) {
    if (!nodes.has(e.from)) problems.push(`${where}: edge from unknown node ${e.from}`);
    if (!nodes.has(e.to)) problems.push(`${where}: edge to unknown node ${e.to}`);
    if (all.has(edgeId(e))) problems.push(`${where}: duplicate id ${edgeId(e)} (give the edge an id)`);
    all.add(edgeId(e));
  }
  for (const g of d.groups) {
    if (all.has(g.id)) problems.push(`${where}: duplicate id ${g.id}`);
    all.add(g.id);
    for (const n of g.nodes) if (!nodes.has(n)) problems.push(`${where}: group ${g.id} names unknown node ${n}`);
  }
  return problems;
}

// ---------- Lesson video ----------

/**
 * Narration voices of the local narrator (Kokoro, Apache-2.0). The first is the default. Without the narrator the
 * player reads the narration with the browser's own speech voice instead, so every voice works everywhere.
 */
export const NARRATION_VOICES = ["af_heart", "af_bella", "am_michael", "am_fenrir", "bf_emma", "bm_george"] as const;
export type NarrationVoice = (typeof NARRATION_VOICES)[number];

const LineRange = z.string().regex(/^\d+(-\d+)?(,\d+(-\d+)?)*$/, 'line numbers such as "3" or "3-5" or "1,4-6"');

export const VideoVisualSchema = z.discriminatedUnion("kind", [
  /** A title card. */
  z.strictObject({
    kind: z.literal("title"),
    heading: z.string().trim().min(1).max(120),
    subheading: z.string().trim().min(1).max(200).optional(),
  }),
  /** Bullet points, revealed one per narration sentence. */
  z.strictObject({
    kind: z.literal("points"),
    heading: z.string().trim().min(1).max(120).optional(),
    items: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
  }),
  /** One of the lesson's diagrams; each step reveals and highlights elements, one step per sentence. */
  z.strictObject({
    kind: z.literal("diagram"),
    diagram: KeySchema,
    steps: z.array(z.array(KeySchema).min(1)).max(12).optional(),
  }),
  /** Code, with lines highlighted step by step. */
  z.strictObject({
    kind: z.literal("code"),
    heading: z.string().trim().min(1).max(120).optional(),
    lang: z.string().trim().min(1).max(20).default("yaml"),
    code: z.string().min(1).max(3000),
    steps: z.array(LineRange).max(12).optional(),
  }),
  /** A terminal session, typed one command per step. */
  z.strictObject({
    kind: z.literal("terminal"),
    lines: z
      .array(z.strictObject({ cmd: z.string().trim().min(1).max(200), out: z.string().max(1200).optional() }))
      .min(1)
      .max(10),
  }),
]);
export type VideoVisual = z.infer<typeof VideoVisualSchema>;

export const VideoSceneSchema = z.strictObject({
  id: KeySchema,
  title: z.string().trim().min(1).max(80),
  /** What the narrator says while the visual plays. Plain sentences: each sentence advances the visual one step. */
  narration: z.string().trim().min(1).max(1500),
  visual: VideoVisualSchema,
});
export type VideoScene = z.infer<typeof VideoSceneSchema>;

export const VideoSchema = z.strictObject({
  voice: z.enum(NARRATION_VOICES).default("af_heart"),
  /** Speaking rate, 1 is normal. */
  speed: z.number().min(0.7).max(1.3).default(1),
  scenes: z.array(VideoSceneSchema).min(1).max(30),
});
export type Video = z.infer<typeof VideoSchema>;

/**
 * Splits narration into sentences: the unit the narrator speaks, the captions show and the visual steps follow.
 * Splits after . ! ? (or a colon at the end of a line) when the next word starts a new sentence, so "e.g. a Pod",
 * "v1.34" and "10.96.0.1" stay whole.
 */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=["'`(]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Content address of one narrated sentence: the narrator's cache key and part of its URL. */
export function narrationHash(voice: string, speed: number, sentence: string): string {
  return createHash("sha256").update(`${voice}|${speed.toFixed(2)}|${sentence}`).digest("hex").slice(0, 32);
}

/** Spoken length estimate (about 15 characters a second at speed 1), for the timeline before audio has loaded. */
export function estimateSeconds(sentence: string, speed = 1): number {
  return Math.max(1.2, sentence.length / 15 / speed);
}

export function videoSeconds(video: Video): number {
  return video.scenes.reduce((sum, s) => sum + splitSentences(s.narration).reduce((a, x) => a + estimateSeconds(x, video.speed) + 0.25, 0), 0);
}

/** Line numbers in a range such as "1,4-6". */
export function linesOf(range: string): number[] {
  return range.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map(Number);
    if (b === undefined) return [a!];
    return Array.from({ length: Math.max(0, b - a! + 1) }, (_, i) => a! + i);
  });
}

/** Diagram ids that the body places with <Diagram id="..." />. */
export function diagramRefsInBody(body: string): string[] {
  return [...body.matchAll(/<Diagram\b[^>]*?\bid=["']([^"']+)["']/g)].map((m) => m[1]!);
}

/** Cross-checks between the body, the diagrams and the video. Empty when everything refers to something real. */
export function lessonMediaProblems(lesson: { body: string; diagrams?: Diagrams; video?: Video | null }): string[] {
  const diagrams = lesson.diagrams ?? {};
  const problems: string[] = [];
  for (const [id, d] of Object.entries(diagrams)) problems.push(...diagramProblems(id, d));
  for (const ref of diagramRefsInBody(lesson.body)) {
    if (!diagrams[ref]) problems.push(`body: <Diagram id="${ref}"> names no diagram in the front matter`);
  }
  const video = lesson.video;
  if (!video) return problems;
  const ids = new Set<string>();
  video.scenes.forEach((s, i) => {
    const where = `video.scenes.${i}`;
    if (ids.has(s.id)) problems.push(`${where}: duplicate scene id ${s.id}`);
    ids.add(s.id);
    const sentences = splitSentences(s.narration).length;
    const v = s.visual;
    if (v.kind === "diagram") {
      const d = diagrams[v.diagram];
      if (!d) {
        problems.push(`${where}.visual: diagram ${v.diagram} is not in the lesson's diagrams`);
      } else {
        const known = diagramElementIds(d);
        for (const step of v.steps ?? []) for (const el of step) if (!known.has(el)) problems.push(`${where}.visual: diagram ${v.diagram} has no node, edge or group ${el}`);
      }
    }
    if (v.kind === "code" && v.steps) {
      const count = v.code.replace(/\n$/, "").split("\n").length;
      for (const r of v.steps) if (linesOf(r).some((n) => n < 1 || n > count)) problems.push(`${where}.visual: lines ${r} are outside the code (${count} lines)`);
    }
    const steps = v.kind === "points" ? v.items.length : v.kind === "terminal" ? v.lines.length : v.kind === "title" ? 0 : (v.steps?.length ?? 0);
    if (steps > sentences) problems.push(`${where}: ${steps} visual steps but ${sentences} narration sentences; each step needs a sentence`);
  });
  return problems;
}

// ---------- Drafting a video from the written lesson ----------

/** Markdown to plain spoken text: no code, tags, links or emphasis marks. */
function speakable(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[A-Z][\s\S]*?\/>/g, " ")
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^#+\s.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(text: string, taken: Set<string>): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "scene";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/**
 * A first draft of the lesson video from the written lesson: a title scene, then one scene per "## " section,
 * using the section's diagram, first code block or bullet list as the visual and its first sentences as the
 * narration. Authors then rewrite the narration so it sounds spoken; the draft only saves the typing.
 */
export function draftVideo(lesson: { title: string; summary: string; body: string; diagrams?: Diagrams }, voice: NarrationVoice = "af_heart"): Video {
  const taken = new Set<string>();
  const scenes: VideoScene[] = [
    { id: slug("intro", taken), title: lesson.title, narration: lesson.summary, visual: { kind: "title", heading: lesson.title, subheading: lesson.summary.slice(0, 200) } },
  ];
  const sections = lesson.body.split(/^## /m).slice(1);
  for (const section of sections) {
    if (scenes.length >= 30) break;
    const newline = section.indexOf("\n");
    const heading = (newline < 0 ? section : section.slice(0, newline)).trim().slice(0, 80);
    const text = newline < 0 ? "" : section.slice(newline + 1);
    const sentences = splitSentences(speakable(text)).slice(0, 4);
    const narration = (sentences.join(" ") || heading).slice(0, 1500);
    const diagram = diagramRefsInBody(text).find((id) => lesson.diagrams?.[id]);
    const code = /```(\w*)[^\n]*\n([\s\S]*?)```/.exec(text);
    const items = [...text.matchAll(/^\s*[-*]\s+(.+)$/gm)].map((m) => speakable(m[1]!).slice(0, 160)).filter(Boolean).slice(0, Math.max(1, Math.min(8, sentences.length)));
    let visual: VideoVisual;
    if (diagram) visual = { kind: "diagram", diagram };
    else if (code && code[2]!.trim()) {
      const lang = code[1] || "text";
      const body = code[2]!.replace(/\n$/, "").slice(0, 3000);
      visual = lang === "bash" || lang === "sh" || lang === "shell"
        ? { kind: "terminal", lines: body.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).slice(0, Math.max(1, Math.min(10, sentences.length))).map((cmd) => ({ cmd: cmd.replace(/^\$\s*/, "").slice(0, 200) })) }
        : { kind: "code", heading, lang, code: body };
    } else if (items.length > 0) visual = { kind: "points", heading, items };
    else visual = { kind: "title", heading };
    scenes.push({ id: slug(heading, taken), title: heading, narration, visual });
  }
  return { voice, speed: 1, scenes };
}
