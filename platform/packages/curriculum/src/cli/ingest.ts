import { migrateAndIngest } from "../db/ingest.ts";
import { loadCurriculum } from "../load.ts";

/** Applies migrations and loads content/curriculum into Postgres. Needs DATABASE_URL. */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const result = await migrateAndIngest(url, await loadCurriculum(process.argv[2]));
console.log(
  `Ingested ${result.certs} certifications: ${result.inserted.length} new curriculum versions, ` +
    `${result.unchanged.length} unchanged.`,
);
