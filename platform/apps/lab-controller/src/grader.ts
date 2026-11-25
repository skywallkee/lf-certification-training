import type { CheckResult } from "@lfct/labs";
import { stringify } from "yaml";
import type { LabRow } from "./db.ts";
import type { LabProvider, Resources } from "./provider/types.ts";

/** Seconds Chainsaw waits for an assertion to become true; short, because the learner is waiting. */
const ASSERT_TIMEOUT = "5s";
const DETAIL_LIMIT = 2000;

type Check = LabRow["tasks"][number]["checks"][number];

/**
 * The shell script and stdin that evaluate one check against the task's cluster: kubectl and Chainsaw see
 * only that cluster's kubeconfig. Exported for tests.
 */
export function checkCommand(check: Check, cluster?: string): { script: string; stdin?: string } {
  const env = cluster ? `export KUBECONFIG="$HOME/.kube/clusters/${cluster}.yaml"\n` : "";
  if (check.assert) {
    const ns = check.namespace ? ` --namespace ${check.namespace}` : "";
    return {
      script: `${env}f=$(mktemp --suffix=.yaml) && cat > "$f" && chainsaw assert --file "$f" --timeout ${ASSERT_TIMEOUT} --no-color${ns}`,
      stdin: stringify(check.assert),
    };
  }
  return { script: `${env}set -eo pipefail\n${check.script ?? "false"}` };
}

/** Runs every check of a lab, in order, and returns one result per check. */
export async function runChecks(provider: LabProvider, sessionId: string, resources: Resources, lab: LabRow): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const task of lab.tasks) {
    for (const check of task.checks) {
      const { script, stdin } = checkCommand(check, task.cluster ?? lab.clusters[0]);
      const where = check.assert ? "grader" : check.runIn;
      let passed = false;
      let detail: string;
      try {
        const out = await provider.exec(sessionId, resources, where, script, { ...(stdin !== undefined ? { stdin } : {}), timeoutMs: 30_000 });
        passed = out.exitCode === 0;
        detail = out.output.trim().slice(-DETAIL_LIMIT);
      } catch (err) {
        detail = `grader error: ${(err as Error).message}`;
      }
      results.push({
        taskId: task.id,
        checkId: check.id,
        passed,
        message: passed ? check.description : (check.failMessage ?? `Not yet: ${check.description}.`),
        ...(detail ? { detail } : {}),
      });
    }
  }
  return results;
}

/** Marker the fake provider recognises; harmless as a shell comment. */
export const SOLUTION_MARKER = "# lfct:solution";

/** Runs the lab's reference solution as the learner would, in the workstation. */
export async function runSolution(provider: LabProvider, sessionId: string, resources: Resources, lab: LabRow) {
  return provider.exec(sessionId, resources, "workstation", `${SOLUTION_MARKER}\nset -e\ncd ~\n${lab.solution}`, {
    asCandidate: true,
    timeoutMs: 300_000,
  });
}
