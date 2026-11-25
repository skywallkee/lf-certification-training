import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { CLOSE_CODES, parseClientMessage, verifyTerminalToken } from "@lfct/labs";
import { WebSocketServer, type WebSocket } from "ws";
import type { LabProvider, Resources } from "./provider/types.ts";
import type { Sessions } from "./sessions.ts";

/**
 * Browser terminal relay: `GET /terminal/<sessionId>?token=...&cols=..&rows=..` upgrades to a WebSocket. The
 * token is signed by the web app for the session's owner and lives two minutes; the relay checks it, checks
 * that the session is running, and pipes bytes between the browser and the lab's ttyd.
 */
export class TerminalRelay {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  private readonly open = new Map<string, Set<WebSocket>>();

  constructor(
    private readonly sessions: Sessions,
    private readonly provider: LabProvider,
    private readonly opts: { tokenSecret: string; allowedOrigins: string[] },
  ) {}

  /** Closes every terminal of a session (it ended). */
  closeSession(sessionId: string): void {
    for (const ws of this.open.get(sessionId) ?? []) ws.close(CLOSE_CODES.ended, "lab ended");
    this.open.delete(sessionId);
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = /^\/terminal\/([0-9a-f-]{36})$/.exec(url.pathname);
    const origin = req.headers.origin;
    if (!match || (origin && !this.opts.allowedOrigins.includes(origin))) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      void this.attach(ws, match[1]!, url).catch((err) => {
        console.error("[relay] attach failed", err);
        ws.close(CLOSE_CODES.unreachable, "terminal unavailable");
      });
    });
  }

  private async attach(ws: WebSocket, sessionId: string, url: URL): Promise<void> {
    const claims = verifyTerminalToken(url.searchParams.get("token") ?? "", this.opts.tokenSecret);
    if (!claims || claims.sid !== sessionId) {
      ws.close(CLOSE_CODES.unauthorized, "invalid token");
      return;
    }
    const found = await this.sessions.get(sessionId);
    if (!found || found.session.userId !== claims.uid) {
      ws.close(CLOSE_CODES.unauthorized, "not your session");
      return;
    }
    if (found.session.status !== "ready" || !found.session.resources) {
      ws.close(CLOSE_CODES.notReady, "lab not running");
      return;
    }
    // A mock exam's terminal opens only once the learner has pressed Start.
    if (found.session.mode !== "lab" && !found.session.startedAt) {
      ws.close(CLOSE_CODES.notReady, "exam not started");
      return;
    }
    const cols = clamp(Number(url.searchParams.get("cols") ?? 100), 20, 500);
    const rows = clamp(Number(url.searchParams.get("rows") ?? 30), 5, 200);
    let terminal;
    try {
      terminal = await this.provider.openTerminal(sessionId, found.session.resources as Resources, { cols, rows });
    } catch (err) {
      console.error(`[relay ${sessionId}] cannot reach the terminal`, err);
      ws.close(CLOSE_CODES.unreachable, "terminal unreachable");
      return;
    }
    const set = this.open.get(sessionId) ?? new Set();
    set.add(ws);
    this.open.set(sessionId, set);

    terminal.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(data, { binary: true });
    });
    terminal.onClose(() => {
      if (ws.readyState === ws.OPEN) ws.close(CLOSE_CODES.unreachable, "terminal closed");
    });
    ws.on("message", (raw, isBinary) => {
      if (isBinary) return;
      const msg = parseClientMessage(raw.toString());
      if (!msg) return;
      if (msg.type === "input") terminal.write(msg.data);
      else terminal.resize(msg.cols, msg.rows);
    });
    ws.on("close", () => {
      terminal.close();
      set.delete(ws);
    });
  }
}

function clamp(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;
}
