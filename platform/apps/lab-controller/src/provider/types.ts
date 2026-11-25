import type { BootStepKey } from "@lfct/labs";
import type { LabRow } from "../db.ts";

/**
 * A place labs run. Phase 2 has local Docker (k3s in a container per session) and a fake for tests; the
 * cloud providers (Tier 1 vCluster nodes, Tier 2 and 3 VMs) implement the same interface later.
 */
export interface LabProvider {
  readonly name: string;
  /** Creates everything a session needs. Reports progress through `onStep`; throws on failure. */
  provision(ctx: ProvisionContext): Promise<Resources>;
  /** Runs a shell script in the grader (cluster-admin, out of the learner's reach) or in the workstation. */
  exec(sessionId: string, resources: Resources, where: "grader" | "workstation", script: string, opts?: ExecOptions): Promise<ExecResult>;
  /** Opens the session's terminal: a byte stream to and from the learner's shell. */
  openTerminal(sessionId: string, resources: Resources, size: { cols: number; rows: number }): Promise<TerminalConnection>;
  /** Removes everything that belongs to the session. Idempotent. */
  destroy(sessionId: string): Promise<void>;
  /** Sessions that still hold resources, for the sweeper's orphan check. */
  listSessions(): Promise<{ sessionId: string; expiresAt: Date | null }[]>;
}

export interface ProvisionContext {
  sessionId: string;
  lab: LabRow;
  /** Hard stop for the resources, written as a label/tag so orphans can be found without the database. */
  deleteAfter: Date;
  onStep(step: BootStepKey, message?: string): Promise<void>;
}

export interface Resources {
  provider: string;
  [key: string]: unknown;
}

export interface ExecOptions {
  stdin?: string;
  timeoutMs?: number;
  /** Run as the learner instead of root (workstation only). */
  asCandidate?: boolean;
}

export interface ExecResult {
  exitCode: number;
  output: string;
}

export interface TerminalConnection {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(cb: (data: Buffer) => void): void;
  onClose(cb: (reason: string) => void): void;
  close(): void;
}
