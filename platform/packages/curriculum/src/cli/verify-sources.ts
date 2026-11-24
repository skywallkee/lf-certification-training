import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { loadCurriculum } from "../load.ts";
import { detectDrift, driftMarkdown, hasDrift, verifyPinnedSources } from "../sources.ts";

/**
 * verify-sources            check every YAML against its pinned PDF (blob SHA, and text where possible)
 * verify-sources --drift    also compare against the tip of cncf/curriculum; exit 2 and write --report on drift
 */
const { values } = parseArgs({
  options: {
    drift: { type: "boolean", default: false },
    report: { type: "string" },
    "content-dir": { type: "string" },
  },
});

const curriculum = await loadCurriculum(values["content-dir"]);
const pinned = await verifyPinnedSources(curriculum);
for (const c of pinned.checked) console.log(`${c.code.padEnd(5)} ${c.verification.padEnd(8)} ${c.result}`);
for (const p of pinned.problems) console.error(`error: ${p}`);
if (pinned.problems.length > 0) process.exit(1);

if (values.drift) {
  const drift = await detectDrift(curriculum);
  const md = driftMarkdown(drift);
  console.log(`\n${md}`);
  if (values.report) await writeFile(values.report, md);
  if (hasDrift(drift)) process.exit(2);
}
