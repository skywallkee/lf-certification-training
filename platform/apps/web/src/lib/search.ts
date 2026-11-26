/**
 * Pure helpers for app-wide search (server/search.ts runs the queries): tokens, scoring, snippets and
 * highlighting. Kept free of server imports so the quick search dialog and the tests can use them.
 */

export const SEARCH_KINDS = ["cert", "competency", "lesson", "question", "lab", "mock"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const KIND_LABEL: Record<SearchKind, string> = {
  cert: "Cert",
  competency: "Competency",
  lesson: "Lesson",
  question: "Question",
  lab: "Lab",
  mock: "Mock exam",
};

export const KIND_PLURAL: Record<SearchKind, string> = {
  cert: "Certs",
  competency: "Competencies",
  lesson: "Lessons",
  question: "Questions",
  lab: "Labs",
  mock: "Mock exams",
};

export interface SearchResult {
  kind: SearchKind;
  title: string;
  href: string;
  /** Cert code, for the cert filter. */
  cert: string;
  context: string;
  /** A short piece of the body around the first match, when the match is not in the title. */
  snippet?: string;
  mock?: boolean;
}

export function isSearchKind(v: unknown): v is SearchKind {
  return typeof v === "string" && (SEARCH_KINDS as readonly string[]).includes(v);
}

/** Lowercase words of two characters or more, at most six. Dots and dashes stay (k8s.io, kube-proxy). */
export function tokenize(query: string): string[] {
  const seen = new Set<string>();
  for (const t of query.toLowerCase().split(/[^a-z0-9.-]+/)) {
    const word = t.replace(/^[.-]+|[.-]+$/g, "");
    if (word.length >= 2) seen.add(word);
  }
  return [...seen].slice(0, 6);
}

/** How many of the tokens appear in the text. */
export function countHits(text: string, tokens: string[]): number {
  const lower = text.toLowerCase();
  return tokens.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0);
}

/**
 * Score for one item: the number of query words found anywhere weighs most, then title hits, then secondary
 * text (summary, domain), then the body. A title that starts with the whole query, or a cert code typed
 * exactly, comes first. Zero means no match.
 */
export function scoreItem(tokens: string[], fields: { title: string; secondary?: string; body?: string; exact?: string }, query = ""): number {
  let s = countHits(fields.title, tokens) * 4 + countHits(fields.secondary ?? "", tokens) * 2 + countHits(fields.body ?? "", tokens);
  if (s === 0) return 0;
  // Items that contain every word of the query come before items that contain only some.
  const all = `${fields.title} ${fields.secondary ?? ""} ${fields.body ?? ""} ${fields.exact ?? ""}`;
  s += countHits(all, tokens) * 10;
  const q = query.trim().toLowerCase();
  if (q && fields.exact && fields.exact.toLowerCase() === q) s += 20;
  if (q && fields.title.toLowerCase().startsWith(q)) s += 3;
  return s;
}

/** Markdown to plain text, enough for snippets: drops code fences, MDX tags, links' URLs and emphasis marks. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/[`*_>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** About `length` characters of the text around the first token found, with ellipses where it was cut. */
export function snippetAround(text: string, tokens: string[], length = 160): string | undefined {
  const lower = text.toLowerCase();
  const at = tokens.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (at === undefined) return undefined;
  let start = Math.max(0, at - Math.floor(length / 3));
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space > 0 && space < at) start = space + 1;
  }
  let end = Math.min(text.length, start + length);
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space > at) end = space;
  }
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Splits text into parts, marking the ones that match a token, for <mark> highlighting. */
export function highlightParts(text: string, tokens: string[]): { text: string; hit: boolean }[] {
  if (tokens.length === 0 || !text) return [{ text, hit: false }];
  const escaped = [...tokens].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text
    .split(re)
    .filter((p) => p !== "")
    .map((p) => ({ text: p, hit: tokens.includes(p.toLowerCase()) }));
}
