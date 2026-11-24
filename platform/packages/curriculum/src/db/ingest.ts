import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, ne } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import type { Cert, Curriculum } from "../load.ts";
import { sourceUrl } from "../queries.ts";
import * as schema from "./schema.ts";

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

export type Db = NodePgDatabase<typeof schema>;

/** Hash of everything that defines a curriculum version, so unchanged YAML is a no-op on re-ingest. */
export function contentHash(cert: Cert): string {
  const canonical = JSON.stringify({
    code: cert.code,
    curriculum: cert.curriculum,
    domains: cert.domains.map((d) => ({
      key: d.key,
      name: d.name,
      weight: d.weight,
      competencies: d.competencies.map((c) => [c.key, c.statement]),
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface IngestResult {
  certs: number;
  inserted: string[];
  unchanged: string[];
}

/** Loads the curriculum into Postgres in one transaction. Idempotent: re-running with the same YAML changes nothing. */
export async function ingestCurriculum(db: Db, curriculum: Curriculum): Promise<IngestResult> {
  const result: IngestResult = { certs: curriculum.certs.size, inserted: [], unchanged: [] };
  await db.transaction(async (tx) => {
    for (const cert of curriculum.certs.values()) {
      await tx
        .insert(schema.certification)
        .values({
          code: cert.code,
          name: cert.name,
          examStyle: cert.examStyle,
          durationMinutes: cert.durationMinutes ?? null,
        })
        .onConflictDoUpdate({
          target: schema.certification.code,
          set: {
            name: cert.name,
            examStyle: cert.examStyle,
            durationMinutes: cert.durationMinutes ?? null,
            updatedAt: new Date(),
          },
        });

      const hash = contentHash(cert);
      const versionId = `${cert.code}:${hash.slice(0, 16)}`;
      const existing = await tx
        .select({ id: schema.curriculumVersion.id })
        .from(schema.curriculumVersion)
        .where(eq(schema.curriculumVersion.id, versionId));

      if (existing.length === 0) {
        const src = cert.curriculum.source;
        await tx
          .update(schema.curriculumVersion)
          .set({ isCurrent: false })
          .where(eq(schema.curriculumVersion.certCode, cert.code));
        await tx.insert(schema.curriculumVersion).values({
          id: versionId,
          certCode: cert.code,
          version: cert.curriculum.version ?? null,
          sourceUrl: sourceUrl(cert),
          sourceCommit: src.kind === "cncf-curriculum" ? src.commit : null,
          sourceBlobSha: src.kind === "cncf-curriculum" ? src.blobSha : null,
          retrievedAt: cert.curriculum.retrievedAt,
          effectiveFrom: cert.curriculum.effectiveFrom ?? null,
          verification: cert.curriculum.verification,
          contentHash: hash,
          isCurrent: true,
        });
        for (const [i, d] of cert.domains.entries()) {
          const [row] = await tx
            .insert(schema.domain)
            .values({ versionId, key: d.key, name: d.name, weight: d.weight, position: i })
            .returning({ id: schema.domain.id });
          if (!row) throw new Error(`failed to insert domain ${d.id}`);
          if (d.competencies.length > 0) {
            await tx.insert(schema.competency).values(
              d.competencies.map((c, j) => ({ domainId: row.id, ref: c.id, statement: c.statement, position: j })),
            );
          }
        }
        result.inserted.push(versionId);
      } else {
        // Same content: make sure it is the current one (e.g. after a revert to an earlier YAML).
        await tx
          .update(schema.curriculumVersion)
          .set({ isCurrent: false })
          .where(and(eq(schema.curriculumVersion.certCode, cert.code), ne(schema.curriculumVersion.id, versionId)));
        await tx
          .update(schema.curriculumVersion)
          .set({ isCurrent: true })
          .where(eq(schema.curriculumVersion.id, versionId));
        result.unchanged.push(versionId);
      }
    }

    for (const p of curriculum.programs) {
      await tx
        .insert(schema.program)
        .values({ key: p.key, name: p.name, sourceUrl: p.source })
        .onConflictDoUpdate({ target: schema.program.key, set: { name: p.name, sourceUrl: p.source } });
      await tx.delete(schema.programMember).where(eq(schema.programMember.programKey, p.key));
      await tx.insert(schema.programMember).values(
        p.members.map((m) => ({
          programKey: p.key,
          certCode: m.cert,
          requiredFrom: m.requiredFrom ?? null,
          retiredAt: m.retiredAt ?? null,
        })),
      );
    }
  });
  return result;
}

/** Opens a pool, applies migrations, ingests, and closes the pool. */
export async function migrateAndIngest(databaseUrl: string, curriculum: Curriculum): Promise<IngestResult> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    return await ingestCurriculum(db, curriculum);
  } finally {
    await pool.end();
  }
}
