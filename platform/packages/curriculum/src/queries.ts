import { CONTENT_KINDS, type ContentKind, type CoverageIndex } from "./coverage.ts";
import type { Cert, Curriculum } from "./load.ts";

export interface CertSummary {
  code: string;
  name: string;
  examStyle: Cert["examStyle"];
  durationMinutes?: number;
  version?: string;
  verification: Cert["curriculum"]["verification"];
  domains: number;
  competencies: number;
  programs: { key: string; requiredFrom?: string }[];
}

export function getCert(curriculum: Curriculum, code: string): Cert {
  const cert = curriculum.certs.get(code.toUpperCase());
  if (!cert) {
    throw new Error(`Unknown certification "${code}". Known: ${[...curriculum.certs.keys()].join(", ")}`);
  }
  return cert;
}

export function summarize(curriculum: Curriculum, cert: Cert): CertSummary {
  return {
    code: cert.code,
    name: cert.name,
    examStyle: cert.examStyle,
    ...(cert.durationMinutes ? { durationMinutes: cert.durationMinutes } : {}),
    ...(cert.curriculum.version ? { version: cert.curriculum.version } : {}),
    verification: cert.curriculum.verification,
    domains: cert.domains.length,
    competencies: cert.domains.reduce((n, d) => n + d.competencies.length, 0),
    programs: curriculum.programs.flatMap((p) => {
      const member = p.members.find((m) => m.cert === cert.code);
      return member ? [{ key: p.key, ...(member.requiredFrom ? { requiredFrom: member.requiredFrom } : {}) }] : [];
    }),
  };
}

export function listCerts(curriculum: Curriculum, filter: { program?: string; examStyle?: string } = {}): CertSummary[] {
  return [...curriculum.certs.values()]
    .map((cert) => summarize(curriculum, cert))
    .filter((s) => !filter.examStyle || s.examStyle === filter.examStyle)
    .filter((s) => !filter.program || s.programs.some((p) => p.key === filter.program));
}

export function sourceUrl(cert: Cert): string {
  const src = cert.curriculum.source;
  return src.kind === "web"
    ? src.url
    : `https://github.com/${src.repo}/blob/${src.commit}/${src.path.split("/").map(encodeURIComponent).join("/")}`;
}

export interface SearchHit {
  id: string;
  cert: string;
  domain: string;
  statement: string;
  score: number;
}

/** Case-insensitive token search over competency statements, domain names and cert names. */
export function searchCompetencies(
  curriculum: Curriculum,
  query: string,
  opts: { cert?: string; limit?: number } = {},
): SearchHit[] {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const { cert, domain, competency } of curriculum.competencies.values()) {
    if (opts.cert && cert.code !== opts.cert.toUpperCase()) continue;
    const statement = competency.statement.toLowerCase();
    const context = `${domain.name} ${cert.code} ${cert.name}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (statement.includes(t)) score += 2;
      else if (context.includes(t)) score += 1;
    }
    if (score > 0) {
      hits.push({ id: competency.id, cert: cert.code, domain: domain.name, statement: competency.statement, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, opts.limit ?? 20);
}

export interface CoverageGap {
  id: string;
  domain: string;
  domainWeight: number;
  statement: string;
  missing: ContentKind[];
}

/**
 * Competencies of a cert that lack the given content kinds. Sorted by domain weight, since a gap in a
 * 30% domain matters more than one in a 10% domain.
 */
export function coverageGaps(
  curriculum: Curriculum,
  coverage: CoverageIndex,
  code: string,
  kinds: readonly ContentKind[] = CONTENT_KINDS,
): CoverageGap[] {
  const cert = getCert(curriculum, code);
  const gaps: CoverageGap[] = [];
  for (const domain of cert.domains) {
    for (const competency of domain.competencies) {
      const present = new Set((coverage.byCompetency.get(competency.id) ?? []).map((r) => r.kind));
      const missing = kinds.filter((k) => !present.has(k));
      if (missing.length > 0) {
        gaps.push({ id: competency.id, domain: domain.name, domainWeight: domain.weight, statement: competency.statement, missing });
      }
    }
  }
  return gaps.sort((a, b) => b.domainWeight - a.domainWeight || a.id.localeCompare(b.id));
}
