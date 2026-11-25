import { parseDocsHosts } from "@lfct/labs/docs";

/** Controller configuration from the environment. Defaults suit `docker compose up` on a laptop. */
function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example at the repository root.`);
  return value;
}

/** Images the k3s version below needs at boot; loading them from the host cache makes boots fast and offline. */
export const K3S_SYSTEM_IMAGES = [
  "rancher/mirrored-pause:3.10.2",
  "rancher/mirrored-coredns-coredns:1.14.7",
  "rancher/local-path-provisioner:v0.0.37",
];

export function loadConfig() {
  const provider = (process.env.LAB_PROVIDER ?? "docker") as "docker" | "fake";
  if (provider !== "docker" && provider !== "fake") throw new Error("LAB_PROVIDER must be docker or fake");
  const tokenSecret = required("LAB_TOKEN_SECRET");
  if (tokenSecret.length < 32) throw new Error("LAB_TOKEN_SECRET must be at least 32 characters");
  const controllerSecret = required("LAB_CONTROLLER_SECRET");
  return {
    databaseUrl: required("DATABASE_URL"),
    port: int("LAB_CONTROLLER_PORT", 3001),
    provider,
    /** Shared secret for the web app's calls to the internal API. */
    controllerSecret,
    /** Verifies the terminal tokens the web app signs. */
    tokenSecret,
    /** Origins allowed to open the terminal WebSocket (the web app's public URL). */
    allowedOrigins: (process.env.LAB_ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    /** Documentation sites the docs pane may show (LAB_DOCS_HOSTS, comma-separated). */
    docsHosts: parseDocsHosts(process.env.LAB_DOCS_HOSTS),
    sweepSeconds: int("LAB_SWEEP_SECONDS", 30),
    /** A session still booting after this long is marked failed and removed. */
    bootTimeoutSeconds: int("LAB_BOOT_TIMEOUT_SECONDS", 600),
    docker: {
      k3sImage: process.env.LAB_K3S_IMAGE ?? "rancher/k3s:v1.34.13-k3s1",
      toolsImage: process.env.LAB_TOOLS_IMAGE ?? "lfct-lab-tools:local",
      /**
       * How the controller reaches a lab's terminal. "network": the controller runs in Docker on LAB_NETWORK and
       * dials the workstation by name (docker compose). "host": the controller runs on the host and dials a port
       * published on 127.0.0.1 (pnpm dev).
       */
      reach: (process.env.LAB_REACH ?? "host") as "host" | "network",
      network: process.env.LAB_NETWORK ?? "lfct-labs",
      preloadImages: (process.env.LAB_PRELOAD_IMAGES ?? K3S_SYSTEM_IMAGES.join(","))
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean),
      clusterMemoryMb: int("LAB_CLUSTER_MEMORY_MB", 0),
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;
