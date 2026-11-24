import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Cert, Curriculum } from "./load.ts";

const exec = promisify(execFile);
export const CNCF_CURRICULUM_URL = "https://github.com/cncf/curriculum.git";

/** Lowercase letters and digits only, so line breaks, hyphenation and bullets in the PDF do not matter. */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/­/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Checks a cert's domains (with weights) and competencies against the text of its source PDF. */
export function checkAgainstText(cert: Cert, pdfText: string): string[] {
  const haystack = normalize(pdfText);
  const problems: string[] = [];
  for (const d of cert.domains) {
    // The PDFs write "25% - Domain name", so weight and name are adjacent once normalized.
    if (!haystack.includes(normalize(`${d.weight} ${d.name}`))) {
      problems.push(`${cert.code}: domain "${d.weight}% ${d.name}" not found in the PDF`);
    }
    for (const c of d.competencies) {
      if (!haystack.includes(normalize(c.statement))) {
        problems.push(`${cert.code}: competency "${c.statement}" (${d.key}) not found in the PDF`);
      }
    }
  }
  return problems;
}

export async function extractPdfText(data: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/** A shallow checkout of one ref of cncf/curriculum in a temp dir. */
export class CurriculumRepo {
  private constructor(
    readonly dir: string,
    readonly commit: string,
  ) {}

  static async fetch(ref: string, url = CNCF_CURRICULUM_URL): Promise<CurriculumRepo> {
    const dir = await mkdtemp(path.join(tmpdir(), "cncf-curriculum-"));
    await exec("git", ["init", "-q", dir]);
    await exec("git", ["-C", dir, "fetch", "-q", "--depth", "1", url, ref]);
    const { stdout } = await exec("git", ["-C", dir, "rev-parse", "FETCH_HEAD"]);
    return new CurriculumRepo(dir, stdout.trim());
  }

  /** Path to git blob SHA for every PDF in the tree. */
  async pdfBlobs(): Promise<Map<string, string>> {
    const { stdout } = await exec("git", ["-C", this.dir, "ls-tree", "-r", "-z", this.commit], {
      maxBuffer: 16 * 1024 * 1024,
    });
    const blobs = new Map<string, string>();
    for (const entry of stdout.split("\0")) {
      const m = /^\d+ blob ([0-9a-f]{40})\t(.+)$/.exec(entry);
      if (m?.[1] && m[2]?.toLowerCase().endsWith(".pdf")) blobs.set(m[2], m[1]);
    }
    return blobs;
  }

  async read(filePath: string): Promise<Uint8Array> {
    const { stdout } = await exec("git", ["-C", this.dir, "cat-file", "blob", `${this.commit}:${filePath}`], {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
    });
    return new Uint8Array(stdout);
  }

  async dispose(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true });
  }
}

export interface VerifyReport {
  problems: string[];
  checked: { code: string; verification: string; result: "text-ok" | "blob-ok" | "skipped" | "failed" }[];
}

/** Verifies every cncf-curriculum source at its pinned commit: blob SHA always, text for `verification: text`. */
export async function verifyPinnedSources(curriculum: Curriculum): Promise<VerifyReport> {
  const report: VerifyReport = { problems: [], checked: [] };
  const byCommit = new Map<string, Cert[]>();
  for (const cert of curriculum.certs.values()) {
    const src = cert.curriculum.source;
    if (src.kind !== "cncf-curriculum") {
      report.checked.push({ code: cert.code, verification: cert.curriculum.verification, result: "skipped" });
      continue;
    }
    byCommit.set(src.commit, [...(byCommit.get(src.commit) ?? []), cert]);
  }
  for (const [commit, certs] of byCommit) {
    const repo = await CurriculumRepo.fetch(commit);
    try {
      const blobs = await repo.pdfBlobs();
      for (const cert of certs) {
        const src = cert.curriculum.source;
        if (src.kind !== "cncf-curriculum") continue;
        const before = report.problems.length;
        const blob = blobs.get(src.path);
        if (!blob) {
          report.problems.push(`${cert.code}: ${src.path} does not exist at ${commit.slice(0, 7)}`);
        } else if (blob !== src.blobSha) {
          report.problems.push(`${cert.code}: blobSha ${src.blobSha} does not match ${blob} at ${commit.slice(0, 7)}`);
        } else if (cert.curriculum.verification === "text") {
          report.problems.push(...checkAgainstText(cert, await extractPdfText(await repo.read(src.path))));
        }
        const failed = report.problems.length > before;
        report.checked.push({
          code: cert.code,
          verification: cert.curriculum.verification,
          result: failed ? "failed" : cert.curriculum.verification === "text" ? "text-ok" : "blob-ok",
        });
      }
    } finally {
      await repo.dispose();
    }
  }
  return report;
}

export interface DriftReport {
  upstreamCommit: string;
  changed: { code: string; path: string }[];
  missing: { code: string; path: string }[];
  untracked: string[];
}

/** Compares the pinned PDFs with the tip of cncf/curriculum to spot revised or new curricula. */
export async function detectDrift(curriculum: Curriculum, ref = "HEAD"): Promise<DriftReport> {
  const repo = await CurriculumRepo.fetch(ref);
  try {
    const blobs = await repo.pdfBlobs();
    const report: DriftReport = { upstreamCommit: repo.commit, changed: [], missing: [], untracked: [] };
    const tracked = new Set<string>();
    for (const cert of curriculum.certs.values()) {
      const src = cert.curriculum.source;
      if (src.kind !== "cncf-curriculum") continue;
      tracked.add(src.path);
      const blob = blobs.get(src.path);
      if (!blob) report.missing.push({ code: cert.code, path: src.path });
      else if (blob !== src.blobSha) report.changed.push({ code: cert.code, path: src.path });
    }
    report.untracked = [...blobs.keys()].filter((p) => !p.startsWith("old-versions/") && !tracked.has(p)).sort();
    return report;
  } finally {
    await repo.dispose();
  }
}

export function hasDrift(r: DriftReport): boolean {
  return r.changed.length + r.missing.length + r.untracked.length > 0;
}

export function driftMarkdown(r: DriftReport): string {
  const lines = [
    `Compared content/curriculum with cncf/curriculum at ${r.upstreamCommit}.`,
    "",
  ];
  if (!hasDrift(r)) return [...lines, "No changes."].join("\n");
  if (r.changed.length) {
    lines.push("**Changed PDFs** (re-transcribe, then update commit and blobSha):", "");
    lines.push(...r.changed.map((c) => `- ${c.code}: \`${c.path}\``), "");
  }
  if (r.missing.length) {
    lines.push("**Pinned PDFs no longer at the tip** (usually renamed for a new version):", "");
    lines.push(...r.missing.map((c) => `- ${c.code}: \`${c.path}\``), "");
  }
  if (r.untracked.length) {
    lines.push("**PDFs not tracked by any cert** (a new version or a new exam):", "");
    lines.push(...r.untracked.map((p) => `- \`${p}\``), "");
  }
  return lines.join("\n");
}
