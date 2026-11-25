import { BOOT_STEPS } from "@lfct/labs";
import type { ExecResult, LabProvider, ProvisionContext, Resources, TerminalConnection } from "./types.ts";

/**
 * In-memory provider for end-to-end tests and UI work without Docker. Boot steps take FAKE_STEP_MS each; the
 * terminal is a tiny line shell; every check fails until the learner types `solve` (or the self-test runs the
 * solution), then every check passes.
 */
export class FakeProvider implements LabProvider {
  readonly name = "fake";
  private readonly live = new Map<string, { solved: boolean; deleteAfter: Date }>();

  constructor(private readonly stepMs = Number(process.env.FAKE_STEP_MS ?? 200)) {}

  async provision(ctx: ProvisionContext): Promise<Resources> {
    this.live.set(ctx.sessionId, { solved: false, deleteAfter: ctx.deleteAfter });
    for (const step of BOOT_STEPS) {
      if (step.key === "setup" && !ctx.lab.setup) continue;
      await ctx.onStep(step.key, `${step.label} (fake)`);
      await new Promise((r) => setTimeout(r, this.stepMs));
    }
    return { provider: "fake" };
  }

  async exec(sessionId: string, _r: Resources, _where: "grader" | "workstation", script: string): Promise<ExecResult> {
    const state = this.live.get(sessionId);
    if (!state) return { exitCode: 1, output: "no such session" };
    if (script.includes("# lfct:solution")) {
      state.solved = true;
      return { exitCode: 0, output: "solution applied" };
    }
    return state.solved ? { exitCode: 0, output: "" } : { exitCode: 1, output: "fake check: not solved yet (type solve in the terminal)" };
  }

  async openTerminal(sessionId: string): Promise<TerminalConnection> {
    const dataListeners: ((d: Buffer) => void)[] = [];
    const closeListeners: ((reason: string) => void)[] = [];
    const emit = (text: string) => setImmediate(() => dataListeners.forEach((cb) => cb(Buffer.from(text))));
    const prompt = "candidate@workstation:~$ ";
    let line = "";
    emit(`Fake lab terminal. Type "solve" to make every check pass.\r\n${prompt}`);
    return {
      write: (data) => {
        for (const ch of data) {
          if (ch === "\r") {
            const cmd = line.trim();
            line = "";
            if (cmd === "solve") {
              const s = this.live.get(sessionId);
              if (s) s.solved = true;
              emit(`\r\nApplied the reference solution (fake).\r\n${prompt}`);
            } else {
              emit(`\r\n${cmd ? `fake: ${cmd}\r\n` : ""}${prompt}`);
            }
          } else if (ch === "\u007f") {
            if (line.length > 0) {
              line = line.slice(0, -1);
              emit("\b \b");
            }
          } else {
            line += ch;
            emit(ch);
          }
        }
      },
      resize: () => undefined,
      onData: (cb) => dataListeners.push(cb),
      onClose: (cb) => closeListeners.push(cb),
      close: () => closeListeners.forEach((cb) => cb("closed")),
    };
  }

  async destroy(sessionId: string): Promise<void> {
    this.live.delete(sessionId);
  }

  async listSessions(): Promise<{ sessionId: string; expiresAt: Date | null }[]> {
    return [...this.live].map(([sessionId, s]) => ({ sessionId, expiresAt: s.deleteAfter }));
  }
}
