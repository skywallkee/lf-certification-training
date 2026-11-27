import { loadConfig, type Config } from "./config.ts";
import { connect } from "./db.ts";
import http from "node:http";
import { createDocsProxy } from "./docs-proxy.ts";
import { DockerProvider } from "./provider/docker.ts";
import { FakeProvider } from "./provider/fake.ts";
import type { LabProvider } from "./provider/types.ts";
import { TerminalRelay } from "./relay.ts";
import { createServer } from "./server.ts";
import { Sessions } from "./sessions.ts";

export function createProvider(config: Config): LabProvider {
  return config.provider === "fake" ? new FakeProvider() : new DockerProvider(config.docker);
}

/** Wires the controller together. Returns a stop function. */
export async function start(config = loadConfig()) {
  const { db, pool } = connect(config.databaseUrl);
  const provider = createProvider(config);
  const sessions = new Sessions(db, provider, { bootTimeoutSeconds: config.bootTimeoutSeconds });
  const relay = new TerminalRelay(sessions, provider, { tokenSecret: config.tokenSecret, allowedOrigins: config.allowedOrigins });
  sessions.onEnded = (id) => relay.closeSession(id);

  const recovered = await sessions.recoverAfterRestart();
  if (recovered > 0) console.log(`Marked ${recovered} half-started lab session(s) as failed after a restart.`);

  const docs = createDocsProxy({ hosts: config.docsHosts, allowedOrigins: config.allowedOrigins, viewerUrl: config.docsUrl });
  const server = createServer({ sessions, relay, secret: config.controllerSecret, providerName: provider.name, docs });
  await new Promise<void>((resolve) => server.listen(config.port, resolve));
  console.log(`Lab controller (${provider.name}) listening on :${config.port}`);
  // One port per docs site (self-hosting): everything on that port is that site, nothing else is served there.
  const docsServers: http.Server[] = [];
  for (const [site, port] of config.docsPorts) {
    if (!config.docsHosts.includes(site)) throw new Error(`LAB_DOCS_PORTS names ${site}, which is not in LAB_DOCS_HOSTS`);
    const s = http.createServer((req, res) => {
      docs.handle(req, res, site).catch((err) => {
        console.error("[docs] request failed", err);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
    await new Promise<void>((resolve) => s.listen(port, resolve));
    docsServers.push(s);
    console.log(`Docs viewer for ${site} listening on :${port}`);
  }

  let sweeping = false;
  const timer = setInterval(async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      const r = await sessions.sweep();
      if (r.expired + r.failed + r.orphans > 0) console.log(`[sweeper] expired ${r.expired}, failed ${r.failed}, removed ${r.orphans} orphan(s)`);
    } catch (err) {
      console.error("[sweeper] sweep failed", err);
    } finally {
      sweeping = false;
    }
  }, config.sweepSeconds * 1000);

  return async () => {
    clearInterval(timer);
    await Promise.all([server, ...docsServers].map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
    await pool.end();
  };
}
