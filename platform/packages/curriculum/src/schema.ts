import * as z from "zod";

/** Lowercase kebab-case key, stable once published: lessons, questions and labs reference it. */
export const KeySchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase kebab-case")
  .max(64);

export const CertCodeSchema = z.string().regex(/^[A-Z]{2,6}$/, "must be 2-6 uppercase letters");

const IsoDate = z.iso.date();
const GitSha = z.string().regex(/^[0-9a-f]{40}$/, "must be a full 40-character git SHA");

export const ExamStyleSchema = z.enum(["performance", "multiple-choice"]);

/**
 * How the YAML was checked against its source:
 * - text: every domain (with its weight) and competency appears in the PDF's text layer; CI re-checks it.
 * - visual: the PDF has no text layer (outlined fonts); transcribed from the rendered page and reviewed by a person.
 * - pending: the source could not be read yet; domains may have no competencies.
 */
export const VerificationSchema = z.enum(["text", "visual", "pending"]);

export const CompetencySchema = z.strictObject({
  key: KeySchema,
  statement: z.string().trim().min(1),
});

export const DomainSchema = z.strictObject({
  key: KeySchema,
  name: z.string().trim().min(1),
  weight: z.int().min(1).max(100),
  competencies: z.array(CompetencySchema),
});

export const CncfCurriculumSourceSchema = z.strictObject({
  kind: z.literal("cncf-curriculum"),
  repo: z.literal("cncf/curriculum"),
  commit: GitSha,
  path: z.string().min(1),
  /** Git blob SHA of the PDF at that commit; a change means the curriculum changed. */
  blobSha: GitSha,
});

export const WebSourceSchema = z.strictObject({
  kind: z.literal("web"),
  url: z.url(),
});

export const SourceSchema = z.discriminatedUnion("kind", [CncfCurriculumSourceSchema, WebSourceSchema]);

export const CurriculumMetaSchema = z.strictObject({
  version: z.string().optional(),
  source: SourceSchema,
  retrievedAt: IsoDate,
  effectiveFrom: IsoDate.optional(),
  verification: VerificationSchema,
});

export const CertificationSchema = z
  .strictObject({
    code: CertCodeSchema,
    name: z.string().trim().min(1),
    examStyle: ExamStyleSchema,
    durationMinutes: z.int().positive().optional(),
    curriculum: CurriculumMetaSchema,
    /** Tools the exam guide says may appear (informational, CNPE lists these). */
    examTools: z.array(z.string()).optional(),
    domains: z.array(DomainSchema).min(1),
  })
  .superRefine((cert, ctx) => {
    const total = cert.domains.reduce((sum, d) => sum + d.weight, 0);
    if (total !== 100) {
      ctx.addIssue({ code: "custom", path: ["domains"], message: `domain weights sum to ${total}, expected 100` });
    }
    const domainKeys = new Set<string>();
    cert.domains.forEach((domain, i) => {
      if (domainKeys.has(domain.key)) {
        ctx.addIssue({ code: "custom", path: ["domains", i, "key"], message: `duplicate domain key ${domain.key}` });
      }
      domainKeys.add(domain.key);
      if (domain.competencies.length === 0 && cert.curriculum.verification !== "pending") {
        ctx.addIssue({
          code: "custom",
          path: ["domains", i, "competencies"],
          message: "a domain needs at least one competency unless verification is pending",
        });
      }
      const compKeys = new Set<string>();
      domain.competencies.forEach((comp, j) => {
        if (compKeys.has(comp.key)) {
          ctx.addIssue({
            code: "custom",
            path: ["domains", i, "competencies", j, "key"],
            message: `duplicate competency key ${comp.key}`,
          });
        }
        compKeys.add(comp.key);
      });
    });
  });

export const ProgramMemberSchema = z.strictObject({
  cert: CertCodeSchema,
  requiredFrom: IsoDate.optional(),
  retiredAt: IsoDate.optional(),
});

export const ProgramSchema = z.strictObject({
  key: KeySchema,
  name: z.string().min(1),
  source: z.url(),
  retrievedAt: IsoDate.optional(),
  members: z.array(ProgramMemberSchema).min(1),
});

export const ProgramsFileSchema = z.strictObject({
  programs: z.array(ProgramSchema).min(1),
});

export type ExamStyle = z.infer<typeof ExamStyleSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type CompetencyInput = z.infer<typeof CompetencySchema>;
export type DomainInput = z.infer<typeof DomainSchema>;
export type CertificationInput = z.infer<typeof CertificationSchema>;
export type Program = z.infer<typeof ProgramSchema>;
export type ProgramsFile = z.infer<typeof ProgramsFileSchema>;
