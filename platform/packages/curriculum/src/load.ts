import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import * as z from "zod";
import { CertificationSchema, ProgramsFileSchema, type CertificationInput, type Program } from "./schema.ts";

/** content/ at the repository root, resolved from this file so it works from any cwd. */
export const DEFAULT_CONTENT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../content",
);

export interface Competency {
  /** Stable id used to tag lessons, questions and labs: `<cert>/<domain>/<competency>`, lowercase. */
  id: string;
  key: string;
  statement: string;
}

export interface Domain {
  id: string;
  key: string;
  name: string;
  weight: number;
  competencies: Competency[];
}

export interface Cert extends Omit<CertificationInput, "domains"> {
  domains: Domain[];
  file: string;
}

export interface Curriculum {
  contentDir: string;
  certs: Map<string, Cert>;
  programs: Program[];
  /** Every competency by id, across all certs. */
  competencies: Map<string, { cert: Cert; domain: Domain; competency: Competency }>;
}

export class CurriculumError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Curriculum is invalid:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "CurriculumError";
  }
}

function formatZod(file: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => `${file}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
}

/** Loads and validates content/curriculum. Throws CurriculumError listing every problem found. */
export async function loadCurriculum(contentDir: string = DEFAULT_CONTENT_DIR): Promise<Curriculum> {
  const curriculumDir = path.join(contentDir, "curriculum");
  const certDir = path.join(curriculumDir, "certs");
  const problems: string[] = [];
  const certs = new Map<string, Cert>();
  const competencies: Curriculum["competencies"] = new Map();

  const files = (await readdir(certDir)).filter((f) => f.endsWith(".yaml")).sort();
  for (const file of files) {
    const rel = path.posix.join("curriculum/certs", file);
    let raw: unknown;
    try {
      raw = parse(await readFile(path.join(certDir, file), "utf8"));
    } catch (err) {
      problems.push(`${rel}: YAML parse error: ${(err as Error).message}`);
      continue;
    }
    const result = CertificationSchema.safeParse(raw);
    if (!result.success) {
      problems.push(...formatZod(rel, result.error));
      continue;
    }
    const input = result.data;
    if (file !== `${input.code.toLowerCase()}.yaml`) {
      problems.push(`${rel}: file name must be ${input.code.toLowerCase()}.yaml`);
    }
    if (certs.has(input.code)) {
      problems.push(`${rel}: duplicate certification ${input.code}`);
      continue;
    }
    const prefix = input.code.toLowerCase();
    const cert: Cert = {
      ...input,
      file: rel,
      domains: input.domains.map((d) => ({
        id: `${prefix}/${d.key}`,
        key: d.key,
        name: d.name,
        weight: d.weight,
        competencies: d.competencies.map((c) => ({ id: `${prefix}/${d.key}/${c.key}`, ...c })),
      })),
    };
    certs.set(cert.code, cert);
    for (const domain of cert.domains) {
      for (const competency of domain.competencies) {
        competencies.set(competency.id, { cert, domain, competency });
      }
    }
  }

  let programs: Program[] = [];
  const programsRel = "curriculum/programs.yaml";
  try {
    const parsed = ProgramsFileSchema.safeParse(parse(await readFile(path.join(curriculumDir, "programs.yaml"), "utf8")));
    if (parsed.success) {
      programs = parsed.data.programs;
    } else {
      problems.push(...formatZod(programsRel, parsed.error));
    }
  } catch (err) {
    problems.push(`${programsRel}: ${(err as Error).message}`);
  }
  for (const program of programs) {
    const seen = new Set<string>();
    for (const member of program.members) {
      if (!certs.has(member.cert)) problems.push(`${programsRel}: ${program.key} lists unknown cert ${member.cert}`);
      if (seen.has(member.cert)) problems.push(`${programsRel}: ${program.key} lists ${member.cert} twice`);
      seen.add(member.cert);
    }
  }

  if (problems.length > 0) throw new CurriculumError(problems);
  return { contentDir, certs, programs, competencies };
}

/** Certs that are members of a program on a given date (default: every member, including future ones). */
export function programMembers(curriculum: Curriculum, programKey: string, on?: string): Cert[] {
  const program = curriculum.programs.find((p) => p.key === programKey);
  if (!program) throw new Error(`unknown program ${programKey}`);
  return program.members
    .filter((m) => !on || ((!m.requiredFrom || m.requiredFrom <= on) && (!m.retiredAt || m.retiredAt > on)))
    .map((m) => curriculum.certs.get(m.cert))
    .filter((c): c is Cert => c !== undefined);
}
