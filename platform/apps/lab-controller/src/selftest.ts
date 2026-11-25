/**
 * Lab self-test: for every lab under content/labs and mock exam under content/mocks (or the ids given as arguments), boot a real session with the
 * local Docker provider, grade it before anything is done (some checks must fail, so they are not vacuous),
 * apply the reference solution as the learner, grade again (every check must pass), and delete the session.
 *
 *   pnpm --filter @lfct/lab-controller selftest [lab-id ...]
 *
 * Needs Docker and the lab tools image (docker compose build lab-tools). No database.
 */
import { randomUUID } from "node:crypto";
import { loadContent, loadCurriculum } from "@lfct/curriculum";
import { loadConfig } from "./config.ts";
import type { LabRow } from "./db.ts";
import { runChecks, runSolution } from "./grader.ts";
import { DockerProvider } from "./provider/docker.ts";
import { FakeProvider } from "./provider/fake.ts";
import type { LabProvider } from "./provider/types.ts";

process.env.LAB_TOKEN_SECRET ??= "selftest-".padEnd(40, "x");
process.env.LAB_CONTROLLER_SECRET ??= "selftest";
process.env.DATABASE_URL ??= "postgres://unused";
const config = loadConfig();
const provider: LabProvider = config.provider === "fake" ? new FakeProvider(0) : new DockerProvider(config.docker);

const only = process.argv.slice(2);
const content = await loadContent(await loadCurriculum());
const labs = content.labs.filter((l) => only.length === 0 || only.includes(l.id));
if (labs.length === 0) {
  console.error(only.length > 0 ? `No lab matches ${only.join(", ")}` : "No labs found");
  process.exit(1);
}

let failures = 0;
for (const l of labs) {
  const lab: LabRow = {
    id: l.id,
    certCode: l.cert,
    title: l.title,
    summary: l.summary,
    tier: l.tier,
    minutes: l.minutes,
    docs: l.docs,
    clusters: l.clusters,
    images: l.images,
    setup: l.setup ?? null,
    solution: l.solution,
    tasks: l.tasks.map((t) => ({ ...t, cluster: t.cluster ?? l.clusters[0]! })),
    competencyRefs: l.competencies,
    kind: l.kind,
    passPercent: l.passPercent ?? null,
    mock: l.mock,
    file: l.file,
    contentHash: l.hash,
    updatedAt: new Date(),
  };
  const sessionId = randomUUID();
  const started = Date.now();
  console.log(`\n== ${lab.id} (session ${sessionId})`);
  try {
    const resources = await provider.provision({
      sessionId,
      lab,
      deleteAfter: new Date(Date.now() + 30 * 60_000),
      onStep: async (step, message) => console.log(`   ${step}: ${message ?? ""}`),
    });
    console.log(`   ready in ${Math.round((Date.now() - started) / 1000)} s`);
    const before = await runChecks(provider, sessionId, resources, lab);
    const vacuous = before.filter((r) => r.passed);
    if (vacuous.length === before.length) {
      console.log("   FAIL: every check passes before the solution is applied");
      failures++;
    } else if (vacuous.length > 0) {
      console.log(`   note: ${vacuous.length} check(s) pass before the solution: ${vacuous.map((r) => r.checkId).join(", ")}`);
    }
    const solution = await runSolution(provider, sessionId, resources, lab);
    if (solution.exitCode !== 0) console.log(`   solution exited ${solution.exitCode}: ${solution.output.slice(-500)}`);
    const after = await runChecks(provider, sessionId, resources, lab);
    for (const r of after) {
      console.log(`   ${r.passed ? "PASS" : "FAIL"} ${r.taskId}/${r.checkId}${r.passed ? "" : `\n        ${(r.detail ?? "").split("\n").slice(-6).join("\n        ")}`}`);
    }
    if (after.some((r) => !r.passed)) failures++;
  } catch (err) {
    console.log(`   FAIL: ${(err as Error).message}`);
    failures++;
  } finally {
    await provider.destroy(sessionId);
  }
}
console.log(failures === 0 ? `\nAll ${labs.length} lab(s) pass with their reference solutions.` : `\n${failures} lab(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
