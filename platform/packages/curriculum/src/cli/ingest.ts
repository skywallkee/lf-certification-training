import { ContentError, CurriculumError, ingestAll } from "../db/ingest.ts";

/**
 * Applies migrations and loads content/ (curriculum, lessons, questions, labs) into Postgres. Needs DATABASE_URL.
 * CONTENT_INCLUDE_SAMPLE=false leaves out the sample set and deletes it from the database.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
try {
  console.log(await ingestAll(url, { includeSample: process.env.CONTENT_INCLUDE_SAMPLE !== "false", curriculumDir: process.argv[2] }));
} catch (err) {
  if (err instanceof CurriculumError || err instanceof ContentError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
