import { loadConfig, type Config } from "./config.ts";
import { connect } from "./db.ts";
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

  const server = createServer({ sessions, relay, secret: config.controllerSecret, providerName: provider.name });
  await new Promise<void>((resolve) => server.listen(config.port, resolve));
  console.log(`Lab controller (${provider.name}) listening on :${config.port}`);

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
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  };
}
