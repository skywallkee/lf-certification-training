import {
  CONTENT_KINDS,
  buildCoverageIndex,
  coverageGaps,
  getCert,
  listCerts,
  loadCurriculum,
  searchCompetencies,
  sourceUrl,
  summarize,
  type Curriculum,
} from "@lfct/curriculum";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

export interface ServerOptions {
  /** content/ directory; defaults to the one in this repository. */
  contentDir?: string;
}

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const certCode = z.string().describe('Certification code, e.g. "CKA" or "ckne" (case-insensitive)');

/**
 * Read-only tools over content/curriculum, for writing lessons, questions and labs.
 * Every call re-reads the YAML and the content folders, so edits show up without a restart.
 */
export function createServer(options: ServerOptions = {}): McpServer {
  const server = new McpServer({ name: "lfct-curriculum", version: "0.1.0" });
  const load = (): Promise<Curriculum> => loadCurriculum(options.contentDir);

  server.registerTool(
    "list_certs",
    {
      description:
        "List the certifications on the Golden Kubestronaut path with exam style, domain and competency counts, " +
        "curriculum version and program membership (including future requirements such as CKNE from 2027-02-15).",
      inputSchema: z.object({
        program: z.enum(["kubestronaut", "golden-kubestronaut"]).optional(),
        examStyle: z.enum(["performance", "multiple-choice"]).optional(),
      }),
    },
    async ({ program, examStyle }) =>
      json(listCerts(await load(), { ...(program ? { program } : {}), ...(examStyle ? { examStyle } : {}) })),
  );

  server.registerTool(
    "get_objectives",
    {
      description:
        "Get one certification's official domains (with exam weights) and competencies, each with the stable " +
        "competency id to put in a lesson's, question's or lab's `competencies:` list, plus the source PDF link.",
      inputSchema: z.object({ cert: certCode }),
    },
    async ({ cert }) => {
      const curriculum = await load();
      const c = getCert(curriculum, cert);
      return json({
        ...summarize(curriculum, c),
        source: sourceUrl(c),
        retrievedAt: c.curriculum.retrievedAt,
        ...(c.examTools ? { examTools: c.examTools } : {}),
        domains: c.domains.map((d) => ({
          id: d.id,
          name: d.name,
          weight: d.weight,
          competencies: d.competencies.map((k) => ({ id: k.id, statement: k.statement })),
        })),
      });
    },
  );

  server.registerTool(
    "get_competency",
    {
      description: "Look up one competency by id and list the lessons, questions and labs already tagged with it.",
      inputSchema: z.object({ id: z.string().describe('Competency id, e.g. "cka/storage/implement-storage-classes-dynamic-volume"') }),
    },
    async ({ id }) => {
      const curriculum = await load();
      const hit = curriculum.competencies.get(id);
      if (!hit) {
        const similar = searchCompetencies(curriculum, id.replace(/[/-]/g, " "), { limit: 5 }).map((h) => h.id);
        throw new Error(`Unknown competency "${id}". Similar: ${similar.join(", ") || "none"}`);
      }
      const coverage = await buildCoverageIndex(curriculum);
      return json({
        id,
        cert: hit.cert.code,
        domain: { id: hit.domain.id, name: hit.domain.name, weight: hit.domain.weight },
        statement: hit.competency.statement,
        source: sourceUrl(hit.cert),
        coveredBy: coverage.byCompetency.get(id) ?? [],
      });
    },
  );

  server.registerTool(
    "search_competencies",
    {
      description:
        "Search competency statements across all certifications by keywords, e.g. to find every cert that tests " +
        "Gateway API or NetworkPolicy, so shared lessons can be tagged once for several certs.",
      inputSchema: z.object({
        query: z.string().min(1),
        cert: certCode.optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    },
    async ({ query, cert, limit }) =>
      json(searchCompetencies(await load(), query, { ...(cert ? { cert } : {}), ...(limit ? { limit } : {}) })),
  );

  server.registerTool(
    "coverage_gaps",
    {
      description:
        "List a certification's competencies that have no lesson, question or lab yet, heaviest domains first. " +
        "Also reports tags in content files that match no competency.",
      inputSchema: z.object({
        cert: certCode,
        kinds: z.array(z.enum(CONTENT_KINDS)).min(1).optional().describe("Only check these content kinds"),
      }),
    },
    async ({ cert, kinds }) => {
      const curriculum = await load();
      const coverage = await buildCoverageIndex(curriculum);
      const code = getCert(curriculum, cert).code.toLowerCase();
      const gaps = coverageGaps(curriculum, coverage, cert, kinds ?? CONTENT_KINDS);
      return json({
        cert: code.toUpperCase(),
        gaps: gaps.length,
        items: gaps,
        unknownTags: coverage.unknownTags.filter((t) => t.tag.startsWith(`${code}/`)),
      });
    },
  );

  return server;
}
