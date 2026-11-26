import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  certification,
  competency,
  curriculumVersion,
  domain,
  lesson,
  programMember,
  question,
} from "@lfct/curriculum/db";

/**
 * The read-only catalog: every cert with its current curriculum, lesson metadata and question counts,
 * read from the tables the ingest job fills. It is small (17 certs, ~400 competencies), so it is loaded
 * whole and kept in memory for a minute.
 */

export interface CatalogCompetency {
  ref: string;
  key: string;
  statement: string;
  domainKey: string;
  certCode: string;
}

export interface CatalogDomain {
  key: string;
  name: string;
  weight: number;
  competencies: CatalogCompetency[];
}

export interface CatalogCert {
  code: string;
  name: string;
  examStyle: "performance" | "multiple-choice";
  durationMinutes: number | null;
  version: string | null;
  sourceUrl: string;
  verification: "text" | "visual" | "pending";
  domains: CatalogDomain[];
  /** Golden Kubestronaut membership date, when the cert joins in the future. */
  requiredFrom: string | null;
  inKubestronaut: boolean;
}

export interface CatalogLesson {
  id: string;
  certCode: string;
  title: string;
  summary: string;
  minutes: number;
  competencyRefs: string[];
  mock: boolean;
}

export interface Catalog {
  certs: Map<string, CatalogCert>;
  competencies: Map<string, { cert: CatalogCert; domain: CatalogDomain; competency: CatalogCompetency }>;
  lessons: CatalogLesson[];
  lessonsById: Map<string, CatalogLesson>;
  /** Number of questions tagged with each competency ref. */
  questionsByCompetency: Map<string, number>;
  questionCountByCert: Map<string, number>;
  loadedAt: number;
}

const TTL_MS = 60_000;
let cached: Promise<Catalog> | undefined;
let cachedAt = 0;

export function getCatalog(): Promise<Catalog> {
  if (!cached || Date.now() - cachedAt > TTL_MS) {
    cachedAt = Date.now();
    cached = loadCatalog().catch((err) => {
      cached = undefined;
      throw err;
    });
  }
  return cached;
}

/** Drops the in-memory catalog, e.g. after an admin re-ingest. */
export function invalidateCatalog(): void {
  cached = undefined;
}

async function loadCatalog(): Promise<Catalog> {
  const db = getDb();
  const [certRows, rows, members, lessonRows, questionRows] = await Promise.all([
    db
      .select({
        code: certification.code,
        name: certification.name,
        examStyle: certification.examStyle,
        durationMinutes: certification.durationMinutes,
        version: curriculumVersion.version,
        sourceUrl: curriculumVersion.sourceUrl,
        verification: curriculumVersion.verification,
        versionId: curriculumVersion.id,
      })
      .from(certification)
      .innerJoin(curriculumVersion, eq(curriculumVersion.certCode, certification.code))
      .where(eq(curriculumVersion.isCurrent, true)),
    db
      .select({
        versionId: domain.versionId,
        domainKey: domain.key,
        domainName: domain.name,
        weight: domain.weight,
        domainPos: domain.position,
        ref: competency.ref,
        statement: competency.statement,
        compPos: competency.position,
      })
      .from(domain)
      .innerJoin(curriculumVersion, eq(curriculumVersion.id, domain.versionId))
      .leftJoin(competency, eq(competency.domainId, domain.id))
      .where(eq(curriculumVersion.isCurrent, true))
      .orderBy(asc(domain.position), asc(competency.position)),
    db.select().from(programMember),
    db
      .select({
        id: lesson.id,
        certCode: lesson.certCode,
        title: lesson.title,
        summary: lesson.summary,
        minutes: lesson.minutes,
        competencyRefs: lesson.competencyRefs,
        mock: lesson.mock,
      })
      .from(lesson)
      .where(eq(lesson.published, true))
      .orderBy(asc(lesson.file)),
    db.select({ certCode: question.certCode, refs: question.competencyRefs }).from(question).where(eq(question.published, true)),
  ]);

  const certs = new Map<string, CatalogCert>();
  const byVersion = new Map<string, CatalogCert>();
  for (const c of certRows) {
    const golden = members.find((m) => m.programKey === "golden-kubestronaut" && m.certCode === c.code);
    const cert: CatalogCert = {
      code: c.code,
      name: c.name,
      examStyle: c.examStyle,
      durationMinutes: c.durationMinutes,
      version: c.version,
      sourceUrl: c.sourceUrl,
      verification: c.verification,
      domains: [],
      requiredFrom: golden?.requiredFrom ?? null,
      inKubestronaut: members.some((m) => m.programKey === "kubestronaut" && m.certCode === c.code),
    };
    certs.set(c.code, cert);
    byVersion.set(c.versionId, cert);
  }
  const competencies: Catalog["competencies"] = new Map();
  for (const r of rows) {
    const cert = byVersion.get(r.versionId);
    if (!cert) continue;
    let d = cert.domains.find((x) => x.key === r.domainKey);
    if (!d) {
      d = { key: r.domainKey, name: r.domainName, weight: r.weight, competencies: [] };
      cert.domains.push(d);
    }
    if (r.ref && r.statement !== null) {
      const comp: CatalogCompetency = {
        ref: r.ref,
        key: r.ref.split("/")[2] ?? r.ref,
        statement: r.statement,
        domainKey: d.key,
        certCode: cert.code,
      };
      d.competencies.push(comp);
      competencies.set(r.ref, { cert, domain: d, competency: comp });
    }
  }
  const questionsByCompetency = new Map<string, number>();
  const questionCountByCert = new Map<string, number>();
  for (const q of questionRows) {
    questionCountByCert.set(q.certCode, (questionCountByCert.get(q.certCode) ?? 0) + 1);
    for (const ref of q.refs) questionsByCompetency.set(ref, (questionsByCompetency.get(ref) ?? 0) + 1);
  }
  return {
    certs,
    competencies,
    lessons: lessonRows,
    lessonsById: new Map(lessonRows.map((l) => [l.id, l])),
    questionsByCompetency,
    questionCountByCert,
    loadedAt: Date.now(),
  };
}

export function competencyPath(ref: string): string {
  const [cert, d, c] = ref.split("/");
  return `/certs/${cert}/domains/${d}/competencies/${c}`;
}

export function lessonsFor(catalog: Catalog, ref: string): CatalogLesson[] {
  return catalog.lessons.filter((l) => l.competencyRefs.includes(ref));
}

export interface Coverage {
  competencies: number;
  withLessons: number;
  withQuestions: number;
  state: "full" | "partial" | "coming";
}

export function coverageOf(catalog: Catalog, refs: string[]): Coverage {
  const withLessons = refs.filter((r) => lessonsFor(catalog, r).length > 0).length;
  const withQuestions = refs.filter((r) => (catalog.questionsByCompetency.get(r) ?? 0) > 0).length;
  const state = refs.length > 0 && withLessons === refs.length && withQuestions === refs.length
    ? "full"
    : withLessons + withQuestions === 0
      ? "coming"
      : "partial";
  return { competencies: refs.length, withLessons, withQuestions, state };
}

export function certRefs(cert: CatalogCert): string[] {
  return cert.domains.flatMap((d) => d.competencies.map((c) => c.ref));
}
