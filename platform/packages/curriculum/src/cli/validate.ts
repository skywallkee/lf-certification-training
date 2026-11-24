import { buildCoverageIndex } from "../coverage.ts";
import { CurriculumError, loadCurriculum, programMembers } from "../load.ts";

/** Validates the curriculum YAML and the competency tags in lessons, questions and labs. */
try {
  const curriculum = await loadCurriculum(process.argv[2]);
  const coverage = await buildCoverageIndex(curriculum);
  for (const { file, tag } of coverage.unknownTags) console.error(`${file}: unknown competency "${tag}"`);
  const golden = programMembers(curriculum, "golden-kubestronaut");
  console.log(
    `OK: ${curriculum.certs.size} certifications, ${curriculum.competencies.size} competencies, ` +
      `${golden.length} in Golden Kubestronaut.`,
  );
  const pending = [...curriculum.certs.values()].filter((c) => c.curriculum.verification === "pending");
  for (const c of pending) console.warn(`warning: ${c.code} curriculum is pending verification against its source`);
  if (coverage.unknownTags.length > 0) process.exit(1);
} catch (err) {
  if (err instanceof CurriculumError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
