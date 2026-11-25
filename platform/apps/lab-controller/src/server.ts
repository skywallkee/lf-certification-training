import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import { HttpError, type Sessions } from "./sessions.ts";
import type { TerminalRelay } from "./relay.ts";

/**
 * Internal HTTP API for the web app (bearer LAB_CONTROLLER_SECRET), plus the public terminal WebSocket.
 *
 *   GET  /health                    liveness and provider name (no auth)
 *   POST /sessions/:id/provision    start booting a `requested` session (202)
 *   POST /sessions/:id/check        grade now, returns { results, score }
 *   POST /sessions/:id/finish       final grading, delete resources, returns { score }
 *   POST /sessions/:id/kill         delete resources without grading (admin)
 */
export function createServer(deps: { sessions: Sessions; relay: TerminalRelay; secret: string; providerName: string }): http.Server {
  const expected = Buffer.from(`Bearer ${deps.secret}`);
  const authorized = (req: http.IncomingMessage) => {
    const got = Buffer.from(req.headers.authorization ?? "");
    return got.length === expected.length && timingSafeEqual(got, expected);
  };

  const server = http.createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") return send(200, { ok: true, provider: deps.providerName });
      const match = /^\/sessions\/([0-9a-f-]{36})\/(provision|check|finish|kill)$/.exec(url.pathname);
      if (!match || req.method !== "POST") return send(404, { error: "not found" });
      if (!authorized(req)) return send(401, { error: "unauthorized" });
      const [, id, action] = match as unknown as [string, string, string];
      switch (action) {
        case "provision":
          return (await deps.sessions.startProvisioning(id)) ? send(202, { ok: true }) : send(409, { error: "session is not waiting to start" });
        case "check":
          return send(200, await deps.sessions.check(id));
        case "finish":
          return send(200, await deps.sessions.end(id, "finished", "Finished by the learner."));
        case "kill":
          return send(200, await deps.sessions.end(id, "killed", "Ended by an admin."));
      }
    } catch (err) {
      if (err instanceof HttpError) return send(err.status, { error: err.message });
      console.error("[api] request failed", err);
      return send(500, { error: "internal error" });
    }
  });
  server.on("upgrade", (req, socket, head) => deps.relay.handleUpgrade(req, socket, head));
  return server;
}
