import { ContentError, loadContent } from "../content.ts";
import { migrateAndIngest } from "../db/ingest.ts";
import { CurriculumError, loadCurriculum } from "../load.ts";

/**
 * Applies migrations and loads content/ (curriculum, lessons, questions) into Postgres. Needs DATABASE_URL.
 * CONTENT_INCLUDE_SAMPLE=false leaves out the sample set and deletes it from the database.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const includeSample = process.env.CONTENT_INCLUDE_SAMPLE !== "false";
try {
  const curriculum = await loadCurriculum(process.argv[2]);
  const content = await loadContent(curriculum, { includeSample });
  const result = await migrateAndIngest(url, curriculum, content, { includeSample });
  console.log(
    `Ingested ${result.certs} certifications: ${result.inserted.length} new curriculum versions, ` +
      `${result.unchanged.length} unchanged. ${result.content?.lessons ?? 0} lessons and ` +
      `${result.content?.questions ?? 0} questions${includeSample ? " (sample set included)" : ""}; ` +
      `removed ${result.content?.removedLessons ?? 0} lessons and ${result.content?.removedQuestions ?? 0} questions.`,
  );
} catch (err) {
  if (err instanceof CurriculumError || err instanceof ContentError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
