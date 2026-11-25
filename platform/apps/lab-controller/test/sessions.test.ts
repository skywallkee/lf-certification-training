import path from "node:path";
import { loadContent, loadCurriculum } from "@lfct/curriculum";
import { migrateAndIngest } from "@lfct/curriculum/ingest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, schema, type Db } from "../src/db.ts";
import { checkCommand, runSolution } from "../src/grader.ts";
import { FakeProvider } from "../src/provider/fake.ts";
import { Sessions } from "../src/sessions.ts";

describe("check commands", () => {
  it("feeds assertion trees to chainsaw on stdin, with the namespace when given", () => {
    const cmd = checkCommand({ id: "c", description: "d", runIn: "grader", assert: { kind: "Role", metadata: { name: "x" } }, namespace: "team-a" });
    expect(cmd.script).toContain("chainsaw assert --file");
    expect(cmd.script).toContain("--namespace team-a");
    expect(cmd.stdin).toContain("kind: Role");
  });

  it("points kubectl and chainsaw at the task's cluster only", () => {
    const cmd = checkCommand({ id: "c", description: "d", runIn: "grader", script: "kubectl get ns" }, "c2");
    expect(cmd.script.split("\n")[0]).toBe('export KUBECONFIG="$HOME/.kube/clusters/c2.yaml"');
  });

  it("runs scripts with errexit and pipefail so every line counts", () => {
    expect(checkCommand({ id: "c", description: "d", runIn: "grader", script: "a\nb" }).script).toBe("set -eo pipefail\na\nb");
  });
});

/** Uses a database of its own next to TEST_DATABASE_URL (other packages reset that one in parallel). */
const base = process.env.TEST_DATABASE_URL;

describe.skipIf(!base)("session lifecycle with the fake provider", () => {
  let db: Db;
  let pool: pg.Pool;
  let sessions: Sessions;
  let provider: FakeProvider;
  const url = base ? `${base.replace(/\/[^/]*$/, "")}/lfct_test_labs` : "";

  beforeAll(async () => {
    const admin = new pg.Pool({ connectionString: base });
    await admin.query("DROP DATABASE IF EXISTS lfct_test_labs WITH (FORCE)");
    await admin.query("CREATE DATABASE lfct_test_labs");
    await admin.end();
    const curriculum = await loadCurriculum();
    await migrateAndIngest(url, curriculum, await loadContent(curriculum));
    ({ db, pool } = connect(url));
    await migrate(db, {
      migrationsFolder: path.resolve(import.meta.dirname, "../../web/drizzle"),
      migrationsTable: "__drizzle_migrations_web",
    });
    await db.insert(schema.user).values({ id: "u1", name: "Learner", email: "learner@example.com", emailVerified: true });
    provider = new FakeProvider(0);
    sessions = new Sessions(db, provider, { bootTimeoutSeconds: 600 });
  });
  afterAll(async () => pool?.end());

  async function waitForStatus(id: string, status: string) {
    for (let i = 0; i < 100; i++) {
      const [row] = await db.select().from(schema.labSession).where(eq(schema.labSession.id, id));
      if (row?.status === status) return row;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`session never reached ${status}`);
  }

  async function newSession(labId = "sample-cka-rbac-pod-reader") {
    const [row] = await db
      .insert(schema.labSession)
      .values({ userId: "u1", labId, certCode: "CKA", provider: "fake", minutes: 20 })
      .returning();
    return row!;
  }

  it("boots, grades with partial credit, and finishes with a final grading", async () => {
    const s = await newSession();
    expect(await sessions.startProvisioning(s.id)).toBe(true);
    const ready = await waitForStatus(s.id, "ready");
    expect(ready.expiresAt!.getTime() - ready.readyAt!.getTime()).toBe(20 * 60_000);

    const first = await sessions.check(s.id);
    expect(first.score).toBe(0);
    expect(first.results.every((r) => !r.passed)).toBe(true);
    expect(first.results[0]!.message).toMatch(/missing|Not yet/);

    const found = await sessions.get(s.id);
    await runSolution(provider, s.id, found!.session.resources as never, found!.lab);
    const second = await sessions.check(s.id);
    expect(second.score).toBe(100);

    expect(await sessions.end(s.id, "finished")).toEqual({ score: 100 });
    const [row] = await db.select().from(schema.labSession).where(eq(schema.labSession.id, s.id));
    expect(row).toMatchObject({ status: "finished", score: 100 });
    const runs = await db.select().from(schema.labCheckRun).where(eq(schema.labCheckRun.sessionId, s.id));
    expect(runs.map((r) => r.kind).sort()).toEqual(["check", "check", "final"]);
    expect(await provider.listSessions()).toEqual([]);
  });

  it("allows one active session per learner", async () => {
    const s = await newSession();
    await expect(newSession()).rejects.toThrow();
    await sessions.end(s.id, "killed");
  });

  it("expires sessions past their time, and removes resources nobody owns", async () => {
    const s = await newSession("sample-ckne-default-deny");
    await sessions.startProvisioning(s.id);
    await waitForStatus(s.id, "ready");
    await db.update(schema.labSession).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.labSession.id, s.id));
    await provider.provision({ sessionId: "00000000-0000-0000-0000-000000000000", lab: (await sessions.get(s.id))!.lab, deleteAfter: new Date(), onStep: async () => undefined });

    const result = await sessions.sweep();
    expect(result.expired).toBe(1);
    expect(result.orphans).toBe(1);
    const [row] = await db.select().from(schema.labSession).where(eq(schema.labSession.id, s.id));
    expect(row).toMatchObject({ status: "expired", score: 0 });
    expect(await provider.listSessions()).toEqual([]);
  });

  it("fails sessions left half-booted by a restart", async () => {
    const s = await newSession();
    await db.update(schema.labSession).set({ status: "booting" }).where(eq(schema.labSession.id, s.id));
    expect(await sessions.recoverAfterRestart()).toBe(1);
    const [row] = await db.select().from(schema.labSession).where(eq(schema.labSession.id, s.id));
    expect(row?.status).toBe("failed");
  });
});
