import { randomBytes } from "node:crypto";
import type { Duplex } from "node:stream";
import Docker from "dockerode";
import WebSocket from "ws";
import type { Config } from "../config.ts";
import type { ExecOptions, ExecResult, LabProvider, ProvisionContext, Resources, TerminalConnection } from "./types.ts";

/**
 * Local Docker provider: the laptop stand-in for the plan's Tier 1 lab node. Each session gets
 *
 * - a bridge network and a volume, both named after the session;
 * - `cluster`: k3s in a privileged container (the same technique as k3d), writing its admin kubeconfig to the
 *   volume;
 * - `grader`: the lab tools image, idle, with cluster-admin rights; checks and the task setup run here, out of
 *   the learner's reach;
 * - `workstation`: the lab tools image serving tmux through ttyd as the unprivileged "candidate" user, with a
 *   per-session password the browser never sees.
 *
 * Everything carries `lfct.session` and `lfct.delete-after` labels, so the sweeper can remove leftovers even if
 * the database row is gone.
 */

const LABEL_MANAGED = "lfct.managed";
const LABEL_SESSION = "lfct.session";
const LABEL_DELETE_AFTER = "lfct.delete-after";
const LABEL_ROLE = "lfct.role";
const TTYD_PORT = 7681;

export interface DockerResources extends Resources {
  provider: "local-docker";
  network: string;
  volume: string;
  containers: { cluster: string; grader: string; workstation: string };
  terminal: { host: string; port: number; credential: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DockerProvider implements LabProvider {
  readonly name = "local-docker";
  private readonly docker: Docker;

  constructor(private readonly config: Config["docker"], docker?: Docker) {
    this.docker = docker ?? new Docker();
  }

  private base(sessionId: string): string {
    return `lfct-lab-${sessionId.replaceAll("-", "").slice(0, 12)}`;
  }

  private labels(sessionId: string, deleteAfter: Date, role?: string): Record<string, string> {
    return {
      [LABEL_MANAGED]: "true",
      [LABEL_SESSION]: sessionId,
      [LABEL_DELETE_AFTER]: deleteAfter.toISOString(),
      ...(role ? { [LABEL_ROLE]: role } : {}),
    };
  }

  /** Pulls an image unless it is already on this machine. */
  async ensureImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
      return;
    } catch {
      // not present: pull below
    }
    const stream = await this.docker.pull(image);
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: Error | null) => (err ? reject(err) : resolve()));
    });
  }

  async provision(ctx: ProvisionContext): Promise<DockerResources> {
    const { sessionId, lab, deleteAfter } = ctx;
    const base = this.base(sessionId);
    const labImages = [...new Set([...this.config.preloadImages, ...lab.images])];

    await ctx.onStep("images", "Checking the cluster, tools and task images on this machine");
    await this.ensureImage(this.config.k3sImage);
    await this.ensureImage(this.config.toolsImage);
    for (const image of labImages) await this.ensureImage(image);

    await ctx.onStep("cluster", "Creating the network and starting k3s");
    const network = `${base}-net`;
    const volume = `${base}-kube`;
    await this.docker.createNetwork({ Name: network, Driver: "bridge", Labels: this.labels(sessionId, deleteAfter) });
    await this.docker.createVolume({ Name: volume, Labels: this.labels(sessionId, deleteAfter) });

    const cluster = await this.docker.createContainer({
      name: `${base}-cluster`,
      Hostname: "lab-node",
      Image: this.config.k3sImage,
      Cmd: [
        "server",
        "--disable=traefik,metrics-server",
        "--tls-san=cluster",
        "--write-kubeconfig=/output/kubeconfig.yaml",
        "--write-kubeconfig-mode=644",
      ],
      Labels: this.labels(sessionId, deleteAfter, "cluster"),
      HostConfig: {
        Privileged: true,
        Tmpfs: { "/run": "", "/var/run": "" },
        Binds: [`${volume}:/output`],
        NetworkMode: network,
        ...(this.config.clusterMemoryMb > 0 ? { Memory: this.config.clusterMemoryMb * 1024 * 1024 } : {}),
      },
      NetworkingConfig: { EndpointsConfig: { [network]: { Aliases: ["cluster"] } } },
    });
    await cluster.start();

    const grader = await this.docker.createContainer({
      name: `${base}-grader`,
      Hostname: "grader",
      Image: this.config.toolsImage,
      Cmd: ["grader"],
      Labels: this.labels(sessionId, deleteAfter, "grader"),
      HostConfig: { Binds: [`${volume}:/lab:ro`], NetworkMode: network },
    });
    await grader.start();

    const password = randomBytes(18).toString("base64url");
    const credential = `candidate:${password}`;
    const workstationName = `${base}-workstation`;
    const workstation = await this.docker.createContainer({
      name: workstationName,
      Hostname: "workstation",
      Image: this.config.toolsImage,
      Cmd: ["workstation"],
      Env: [`TTYD_CREDENTIAL=${credential}`],
      Labels: this.labels(sessionId, deleteAfter, "workstation"),
      ExposedPorts: { [`${TTYD_PORT}/tcp`]: {} },
      HostConfig: {
        Binds: [`${volume}:/lab:ro`],
        NetworkMode: network,
        ...(this.config.reach === "host" ? { PortBindings: { [`${TTYD_PORT}/tcp`]: [{ HostIp: "127.0.0.1", HostPort: "" }] } } : {}),
      },
    });
    if (this.config.reach === "network") {
      // The controller's own network: it dials the terminal by container name; the k3s API stays private.
      await this.docker.getNetwork(this.config.network).connect({ Container: workstation.id });
    }
    await workstation.start();

    const resources: DockerResources = {
      provider: "local-docker",
      network,
      volume,
      containers: { cluster: cluster.id, grader: grader.id, workstation: workstation.id },
      terminal: { host: workstationName, port: TTYD_PORT, credential },
    };
    if (this.config.reach === "host") {
      const info = await workstation.inspect();
      const binding = info.NetworkSettings.Ports[`${TTYD_PORT}/tcp`]?.[0];
      if (!binding) throw new Error("the workstation's terminal port was not published");
      resources.terminal = { host: "127.0.0.1", port: Number(binding.HostPort), credential };
    }

    await ctx.onStep("api", "Waiting for the Kubernetes API and the node");
    await this.waitFor(sessionId, resources, "kubectl get --raw /readyz >/dev/null 2>&1", 240_000, "the Kubernetes API did not become ready");
    await this.waitFor(
      sessionId,
      resources,
      "kubectl get nodes -o name 2>/dev/null | grep -q . && kubectl wait --for=condition=Ready nodes --all --timeout=5s >/dev/null 2>&1",
      180_000,
      "the node did not become Ready",
    );

    await ctx.onStep("load-images", `Loading ${labImages.length} image${labImages.length === 1 ? "" : "s"} into the cluster`);
    if (labImages.length > 0) await this.importImages(cluster.id, labImages);

    if (lab.setup) {
      await ctx.onStep("setup", "Running the task setup");
      const result = await this.exec(sessionId, resources, "grader", `set -e\n${lab.setup}`, { timeoutMs: 180_000 });
      if (result.exitCode !== 0) throw new Error(`the task setup failed: ${result.output.slice(-500)}`);
    }

    await ctx.onStep("terminal", "Starting your terminal");
    await this.waitFor(
      sessionId,
      resources,
      `test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${TTYD_PORT}/)" = 401`,
      60_000,
      "the terminal did not start",
      "workstation",
    );
    return resources;
  }

  private async waitFor(
    sessionId: string,
    resources: Resources,
    script: string,
    timeoutMs: number,
    message: string,
    where: "grader" | "workstation" = "grader",
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await this.exec(sessionId, resources, where, script, { timeoutMs: 15_000 }).catch(() => ({ exitCode: 1, output: "" }));
      if (result.exitCode === 0) return;
      await sleep(1000);
    }
    throw new Error(message);
  }

  /**
   * Streams `docker save` of the images into k3s's containerd. Only the host's platform is exported, which
   * matters on Docker's containerd image store where `save` would otherwise reference every platform.
   */
  private async importImages(clusterId: string, images: string[]): Promise<void> {
    const arch = process.arch === "arm64" ? "arm64" : "amd64";
    const options = { names: images, platform: JSON.stringify({ os: "linux", architecture: arch }) };
    const tar = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
      this.docker.modem.dial(
        { path: "/images/get?", options, method: "GET", isStream: true, statusCodes: { 200: true, 404: "image not found", 500: "server error" } },
        (err: Error | null, stream: unknown) => (err ? reject(err) : resolve(stream as NodeJS.ReadableStream)),
      );
    });
    const result = await this.execRaw(clusterId, ["ctr", "-n", "k8s.io", "images", "import", "-"], { stdinStream: tar, timeoutMs: 600_000 });
    if (result.exitCode !== 0) throw new Error(`loading images into the cluster failed: ${result.output.slice(-500)}`);
  }

  async exec(_sessionId: string, resources: Resources, where: "grader" | "workstation", script: string, opts: ExecOptions = {}): Promise<ExecResult> {
    const res = resources as DockerResources;
    const id = res.containers[where];
    const env = opts.asCandidate ? ["HOME=/home/candidate", "KUBECONFIG=/home/candidate/.kube/config"] : ["HOME=/root"];
    return this.execRaw(id, ["bash", "-c", script], {
      ...(opts.stdin !== undefined ? { stdin: opts.stdin } : {}),
      timeoutMs: opts.timeoutMs ?? 30_000,
      user: opts.asCandidate ? "candidate" : "root",
      env,
    });
  }

  private async execRaw(
    containerId: string,
    cmd: string[],
    opts: { stdin?: string; stdinStream?: NodeJS.ReadableStream; timeoutMs: number; user?: string; env?: string[] },
  ): Promise<ExecResult> {
    const container = this.docker.getContainer(containerId);
    const withStdin = opts.stdin !== undefined || opts.stdinStream !== undefined;
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: withStdin,
      ...(opts.user ? { User: opts.user } : {}),
      ...(opts.env ? { Env: opts.env } : {}),
    });
    const stream = (await exec.start({ hijack: true, stdin: withStdin })) as Duplex;
    const chunks: Buffer[] = [];
    const sink = { write: (c: Buffer) => chunks.push(Buffer.from(c)) };
    this.docker.modem.demuxStream(stream, sink as never, sink as never);
    if (opts.stdin !== undefined) {
      stream.end(opts.stdin);
    } else if (opts.stdinStream) {
      opts.stdinStream.pipe(stream);
    }
    const done = new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("close", resolve);
      stream.on("error", reject);
    });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), opts.timeoutMs);
    });
    const outcome = await Promise.race([done.then(() => "done" as const), timeout]);
    clearTimeout(timer);
    if (outcome === "timeout") {
      stream.destroy();
      return { exitCode: 124, output: `${Buffer.concat(chunks).toString("utf8")}\n(timed out after ${opts.timeoutMs} ms)` };
    }
    // The exit code can lag the end of the stream by a moment.
    for (let i = 0; i < 20; i++) {
      const info = await exec.inspect();
      if (!info.Running) return { exitCode: info.ExitCode ?? 1, output: Buffer.concat(chunks).toString("utf8") };
      await sleep(50);
    }
    return { exitCode: 1, output: Buffer.concat(chunks).toString("utf8") };
  }

  async openTerminal(_sessionId: string, resources: Resources, size: { cols: number; rows: number }): Promise<TerminalConnection> {
    const { terminal } = resources as DockerResources;
    return openTtyd(`ws://${terminal.host}:${terminal.port}/ws`, terminal.credential, size);
  }

  async destroy(sessionId: string): Promise<void> {
    const filters = JSON.stringify({ label: [`${LABEL_SESSION}=${sessionId}`] });
    const containers = await this.docker.listContainers({ all: true, filters });
    await Promise.all(containers.map((c) => this.docker.getContainer(c.Id).remove({ force: true, v: true }).catch(() => undefined)));
    const networks = await this.docker.listNetworks({ filters });
    for (const n of networks) await this.docker.getNetwork(n.Id).remove().catch(() => undefined);
    const { Volumes } = await this.docker.listVolumes({ filters });
    for (const v of Volumes ?? []) await this.docker.getVolume(v.Name).remove({ force: true }).catch(() => undefined);
  }

  async listSessions(): Promise<{ sessionId: string; expiresAt: Date | null }[]> {
    const filters = JSON.stringify({ label: [`${LABEL_MANAGED}=true`] });
    const [containers, networks] = await Promise.all([
      this.docker.listContainers({ all: true, filters }),
      this.docker.listNetworks({ filters }),
    ]);
    const out = new Map<string, Date | null>();
    for (const labels of [...containers.map((c) => c.Labels), ...networks.map((n) => n.Labels ?? {})]) {
      const id = labels[LABEL_SESSION];
      if (!id) continue;
      const after = labels[LABEL_DELETE_AFTER];
      out.set(id, after ? new Date(after) : null);
    }
    return [...out].map(([sessionId, expiresAt]) => ({ sessionId, expiresAt }));
  }
}

/**
 * ttyd's WebSocket protocol (1.7): subprotocol "tty"; the first client message is JSON with the base64
 * credential and the terminal size; after that each frame starts with a command byte. Client: "0" input,
 * "1" resize (JSON). Server: "0" output, "1" window title, "2" preferences.
 */
export function openTtyd(url: string, credential: string, size: { cols: number; rows: number }): Promise<TerminalConnection> {
  const auth = Buffer.from(credential).toString("base64");
  const ws = new WebSocket(url, ["tty"], { headers: { Authorization: `Basic ${auth}` }, handshakeTimeout: 10_000 });
  const dataListeners: ((d: Buffer) => void)[] = [];
  const closeListeners: ((reason: string) => void)[] = [];
  let closed = false;
  const fireClose = (reason: string) => {
    if (closed) return;
    closed = true;
    for (const cb of closeListeners) cb(reason);
  };
  return new Promise((resolve, reject) => {
    ws.once("error", (err) => {
      reject(err);
      fireClose(err.message);
    });
    ws.once("open", () => {
      ws.send(JSON.stringify({ AuthToken: auth, columns: size.cols, rows: size.rows }));
      resolve({
        write: (data) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(Buffer.concat([Buffer.from("0"), Buffer.from(data, "utf8")]));
        },
        resize: (cols, rows) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(Buffer.from(`1${JSON.stringify({ columns: cols, rows })}`));
        },
        onData: (cb) => dataListeners.push(cb),
        onClose: (cb) => closeListeners.push(cb),
        close: () => ws.close(),
      });
    });
    ws.on("message", (raw: Buffer) => {
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
      if (buf[0] === 0x30) for (const cb of dataListeners) cb(buf.subarray(1));
    });
    ws.on("close", () => fireClose("terminal closed"));
  });
}
