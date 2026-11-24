import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type { Curriculum } from "./load.ts";

/** Content kinds that can be tagged with competencies, each in its own folder under content/. */
export const CONTENT_KINDS = ["lessons", "questions", "labs"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export interface ContentRef {
  kind: ContentKind;
  /** Path relative to content/. */
  file: string;
}

export interface CoverageIndex {
  /** Competency id to the content items that cover it. */
  byCompetency: Map<string, ContentRef[]>;
  /** Tags that do not match any competency id (typos or retired competencies). */
  unknownTags: { file: string; tag: string }[];
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/** Collects every `competencies: [...]` list anywhere in a parsed YAML value. */
function collectTags(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTags(item, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "competencies" && Array.isArray(v)) {
        out.push(...v.filter((t): t is string => typeof t === "string"));
      } else {
        collectTags(v, out);
      }
    }
  }
}

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(mdx?|ya?ml)$/.test(entry.name)) files.push(full);
  }
  return files;
}

/**
 * Tagging convention: an MDX/Markdown file lists `competencies:` in its front matter; a YAML file
 * (question bank, lab definition) may list `competencies:` at any level, e.g. once per question.
 */
export async function buildCoverageIndex(curriculum: Curriculum): Promise<CoverageIndex> {
  const byCompetency = new Map<string, ContentRef[]>();
  const unknownTags: CoverageIndex["unknownTags"] = [];
  for (const kind of CONTENT_KINDS) {
    for (const full of await walk(path.join(curriculum.contentDir, kind))) {
      const file = path.relative(curriculum.contentDir, full).split(path.sep).join("/");
      const text = await readFile(full, "utf8");
      let doc: unknown;
      if (/\.mdx?$/.test(full)) {
        const fm = FRONT_MATTER.exec(text);
        doc = fm ? parse(fm[1] ?? "") : undefined;
      } else {
        doc = parse(text);
      }
      const tags: string[] = [];
      collectTags(doc, tags);
      for (const tag of new Set(tags)) {
        if (!curriculum.competencies.has(tag)) {
          unknownTags.push({ file, tag });
          continue;
        }
        const refs = byCompetency.get(tag) ?? [];
        refs.push({ kind, file });
        byCompetency.set(tag, refs);
      }
    }
  }
  return { byCompetency, unknownTags };
}
