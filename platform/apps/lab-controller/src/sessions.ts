import { EXTEND_MINUTES, isActive, scoreOf, type BootStepKey, type CheckResult, bootStepIndex } from "@lfct/labs";
import { and, eq, inArray, lt } from "drizzle-orm";
import { runChecks } from "./grader.ts";
import type { Db, LabRow, SessionRow } from "./db.ts";
import { schema } from "./db.ts";
import type { LabProvider, Resources } from "./provider/types.ts";

const { lab: labTable, labSession, labCheckRun } = schema;

export interface GradeOutcome {
  results: CheckResult[];
  score: number;
  runId: number;
}

type EndReason = "finished" | "expired" | "killed" | "failed";

/**
 * Session lifecycle. The web app inserts `requested` rows; everything after that happens here, one operation at a
 * time per session.
 */
export class Sessions {
  private readonly locks = new Map<string, Promise<unknown>>();
  /** Called when a session ends, so open terminals can be closed. */
  onEnded: (sessionId: string) => void = () => undefined;

  constructor(
    private readonly db: Db,
    private readonly provider: LabProvider,
    private readonly opts: { bootTimeoutSeconds: number },
  ) {}

  /** Serialises operations on one session. */
  private withLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(sessionId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.locks.set(sessionId, next);
    void next.finally(() => {
      if (this.locks.get(sessionId) === next) this.locks.delete(sessionId);
    }).catch(() => undefined);
    return next;
  }

  async get(sessionId: string): Promise<{ session: SessionRow; lab: LabRow } | null> {
    const [session] = await this.db.select().from(labSession).where(eq(labSession.id, sessionId));
    if (!session) return null;
    const [lab] = await this.db.select().from(labTable).where(eq(labTable.id, session.labId));
    if (!lab) return null;
    return { session, lab };
  }

  /** Starts provisioning in the background. Returns false if the session is not waiting to be provisioned. */
  async startProvisioning(sessionId: string): Promise<boolean> {
    const found = await this.get(sessionId);
    if (!found || found.session.status !== "requested") return false;
    void this.withLock(sessionId, () => this.provision(found.session, found.lab)).catch((err) => {
      console.error(`[lab ${sessionId}] provisioning crashed`, err);
    });
    return true;
  }

  private async provision(session: SessionRow, lab: LabRow): Promise<void> {
    const sessionId = session.id;
    const moved = await this.db
      .update(labSession)
      .set({ status: "booting", bootStep: 0, statusMessage: "Starting" })
      .where(and(eq(labSession.id, sessionId), eq(labSession.status, "requested")))
      .returning({ id: labSession.id });
    if (moved.length === 0) return;
    // Resources outlive the session by its length, one extension, the boot timeout and a margin, then the
    // sweeper deletes them whatever the database says.
    const deleteAfter = new Date(Date.now() + (lab.minutes + EXTEND_MINUTES + 30) * 60_000 + this.opts.bootTimeoutSeconds * 1000);
    const started = Date.now();
    try {
      const resources = await this.provider.provision({
        sessionId,
        lab,
        deleteAfter,
        onStep: async (step: BootStepKey, message?: string) => {
          console.log(`[lab ${sessionId}] ${step}${message ? `: ${message}` : ""}`);
          await this.db
            .update(labSession)
            .set({ bootStep: bootStepIndex(step), statusMessage: message ?? null })
            .where(and(eq(labSession.id, sessionId), eq(labSession.status, "booting")));
        },
      });
      const now = new Date();
      const ready = await this.db
        .update(labSession)
        .set({
          status: "ready",
          resources,
          readyAt: now,
          expiresAt: new Date(now.getTime() + session.minutes * 60_000),
          statusMessage: `Ready in ${Math.round((Date.now() - started) / 1000)} s`,
        })
        .where(and(eq(labSession.id, sessionId), eq(labSession.status, "booting")))
        .returning({ id: labSession.id });
      if (ready.length === 0) {
        // Finished or killed while booting: nothing should be left behind.
        await this.provider.destroy(sessionId);
      }
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[lab ${sessionId}] boot failed: ${message}`);
      await this.provider.destroy(sessionId).catch(() => undefined);
      await this.db
        .update(labSession)
        .set({ status: "failed", statusMessage: `The lab could not start: ${message}`.slice(0, 1000), endedAt: new Date() })
        .where(eq(labSession.id, sessionId));
      this.onEnded(sessionId);
    }
  }

  private async grade(session: SessionRow, lab: LabRow, kind: "check" | "final"): Promise<GradeOutcome> {
    const results = await runChecks(this.provider, session.id, session.resources as Resources, lab);
    const score = scoreOf(lab.tasks, results);
    const [run] = await this.db.insert(labCheckRun).values({ sessionId: session.id, kind, results, score }).returning({ id: labCheckRun.id });
    return { results, score, runId: run!.id };
  }

  /** "Check my work": grades the cluster as it is now. */
  check(sessionId: string): Promise<GradeOutcome> {
    return this.withLock(sessionId, async () => {
      const found = await this.get(sessionId);
      if (!found) throw new HttpError(404, "no such session");
      if (found.session.status !== "ready") throw new HttpError(409, "the lab is not running");
      return this.grade(found.session, found.lab, "check");
    });
  }

  /**
   * Ends a session: grades it one last time if it was running, deletes its resources and records the outcome.
   * Safe to call twice.
   */
  end(sessionId: string, reason: EndReason, message?: string): Promise<{ score: number | null }> {
    return this.withLock(sessionId, async () => {
      const found = await this.get(sessionId);
      if (!found) {
        await this.provider.destroy(sessionId);
        return { score: null };
      }
      const { session, lab } = found;
      if (!isActive(session.status)) return { score: session.score };
      let score: number | null = null;
      if (session.status === "ready" && reason !== "killed") {
        try {
          score = (await this.grade(session, lab, "final")).score;
        } catch (err) {
          console.error(`[lab ${sessionId}] final grading failed`, err);
        }
      }
      await this.provider.destroy(sessionId).catch((err) => console.error(`[lab ${sessionId}] destroy failed`, err));
      await this.db
        .update(labSession)
        .set({ status: reason, endedAt: new Date(), score, statusMessage: message ?? null })
        .where(eq(labSession.id, sessionId));
      this.onEnded(sessionId);
      return { score };
    });
  }

  /** Sessions left half-booted by a previous controller process cannot resume: fail them and clean up. */
  async recoverAfterRestart(): Promise<number> {
    const stuck = await this.db
      .select({ id: labSession.id })
      .from(labSession)
      .where(inArray(labSession.status, ["requested", "booting"]));
    for (const { id } of stuck) await this.end(id, "failed", "The lab controller restarted while this lab was starting. Start it again.");
    return stuck.length;
  }

  /** One sweep: expire timed-out sessions, fail stuck boots, remove resources nobody owns. */
  async sweep(now = new Date()): Promise<{ expired: number; failed: number; orphans: number }> {
    const expired = await this.db
      .select({ id: labSession.id })
      .from(labSession)
      .where(and(eq(labSession.status, "ready"), lt(labSession.expiresAt, now)));
    for (const { id } of expired) await this.end(id, "expired", "Time ran out. The lab was graded and deleted.");

    const bootCutoff = new Date(now.getTime() - this.opts.bootTimeoutSeconds * 1000);
    const stuck = await this.db
      .select({ id: labSession.id })
      .from(labSession)
      .where(and(eq(labSession.status, "booting"), lt(labSession.createdAt, bootCutoff)));
    for (const { id } of stuck) await this.end(id, "failed", "The lab took too long to start and was removed. Start it again.");

    let orphans = 0;
    const live = await this.provider.listSessions();
    if (live.length > 0) {
      const rows = await this.db
        .select({ id: labSession.id, status: labSession.status })
        .from(labSession)
        .where(inArray(labSession.id, live.map((l) => l.sessionId)));
      const status = new Map(rows.map((r) => [r.id, r.status]));
      for (const l of live) {
        const s = status.get(l.sessionId);
        const pastDeadline = l.expiresAt !== null && l.expiresAt < now;
        if ((!s || !isActive(s)) && !this.locks.has(l.sessionId)) {
          await this.provider.destroy(l.sessionId);
          orphans++;
        } else if (pastDeadline) {
          await this.end(l.sessionId, "expired", "The lab passed its hard time limit and was deleted.");
          orphans++;
        }
      }
    }
    return { expired: expired.length, failed: stuck.length, orphans };
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
