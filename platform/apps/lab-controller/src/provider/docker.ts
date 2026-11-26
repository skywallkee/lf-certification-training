import { createHash, randomBytes } from "node:crypto";
import type { Duplex } from "node:stream";
import Docker from "dockerode";
import WebSocket from "ws";
import type { Config } from "../config.ts";
import type { ExecOptions, ExecResult, LabProvider, ProvisionContext, Resources, TerminalConnection } from "./types.ts";

/**
 * Local Docker provider: the laptop stand-in for the plan's Tier 1 lab node. Each session gets
 *
 * - a bridge network and a volume, both named after the session;
 * - one k3s container per cluster of the lab (privileged, the same technique as k3d), each named after the
 *   cluster on the session network and writing its admin kubeconfig to the volume;
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
/** Shared by every session: `docker save` archives of the images clusters need, imported by k3s as it boots. */
export const IMAGE_CACHE_VOLUME = "lfct-image-cache";
/** k3s imports every archive in this folder into containerd when it starts (its airgap mechanism). */
const K3S_IMAGES_DIR = "/var/lib/rancher/k3s/agent/images";

export interface DockerResources extends Resources {
  provider: "local-docker";
  network: string;
  volume: string;
  containers: { clusters: Record<string, string>; grader: string; workstation: string };
  terminal: { host: string; port: number; credential: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DockerProvider implements LabProvider {
  readonly name = "local-docker";
  private readonly docker: Docker;
  /** Image cache folders being built or known to exist, by key; one build per key at a time. */
  private readonly cacheBuilds = new Map<string, Promise<string | null>>();

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
    await Promise.all([this.config.k3sImage, this.config.toolsImage, ...labImages].map((image) => this.ensureImage(image)));
    // Saved once per set of images and imported by k3s while it boots, instead of streamed into every cluster
    // after its API is up. Null when the cache is off or could not be built: the images are streamed in later.
    const cache = await this.imageCache(labImages);

    const clusterNames = lab.clusters.length > 0 ? lab.clusters : ["k8s"];
    const plural = clusterNames.length > 1;
    await ctx.onStep("cluster", plural ? `Creating the network and starting ${clusterNames.length} k3s clusters` : "Creating the network and starting k3s");
    const network = `${base}-net`;
    const volume = `${base}-kube`;
    await Promise.all([
      this.docker.createNetwork({ Name: network, Driver: "bridge", Labels: this.labels(sessionId, deleteAfter) }),
      this.docker.createVolume({ Name: volume, Labels: this.labels(sessionId, deleteAfter) }),
    ]);

    const clusterEnv = `LAB_CLUSTERS=${clusterNames.join(" ")}`;
    const password = randomBytes(18).toString("base64url");
    const credential = `candidate:${password}`;
    const workstationName = `${base}-workstation`;

    // Every container starts at once: the grader and the workstation wait for the kubeconfigs on their own.
    const startCluster = async (name: string): Promise<[string, string]> => {
      const k3sArgs = ["server", "--disable=traefik,metrics-server", `--tls-san=${name}`, `--write-kubeconfig=/output/${name}.yaml`, "--write-kubeconfig-mode=644"];
      const cluster = await this.docker.createContainer({
        name: `${base}-${name}`,
        Hostname: `${name}-node`,
        Image: this.config.k3sImage,
        // With the cache, link its archives into k3s's airgap image folder first; k3s imports them as it starts.
        ...(cache
          ? {
              Entrypoint: ["/bin/sh", "-c", `mkdir -p ${K3S_IMAGES_DIR} && ln -sf /image-cache/${cache}/*.tar ${K3S_IMAGES_DIR}/ && exec /bin/k3s "$@"`, "k3s"],
            }
          : {}),
        Cmd: k3sArgs,
        Labels: this.labels(sessionId, deleteAfter, "cluster"),
        HostConfig: {
          Privileged: true,
          Tmpfs: { "/run": "", "/var/run": "" },
          Binds: [`${volume}:/output`, ...(cache ? [`${IMAGE_CACHE_VOLUME}:/image-cache:ro`] : [])],
          NetworkMode: network,
          ...(this.config.clusterMemoryMb > 0 ? { Memory: this.config.clusterMemoryMb * 1024 * 1024 } : {}),
        },
        NetworkingConfig: { EndpointsConfig: { [network]: { Aliases: [name] } } },
      });
      await cluster.start();
      return [name, cluster.id];
    };
    const startGrader = async () => {
      const grader = await this.docker.createContainer({
        name: `${base}-grader`,
        Hostname: "grader",
        Image: this.config.toolsImage,
        Cmd: ["grader"],
        Env: [clusterEnv],
        Labels: this.labels(sessionId, deleteAfter, "grader"),
        HostConfig: { Binds: [`${volume}:/lab:ro`], NetworkMode: network },
      });
      await grader.start();
      return grader;
    };
    const startWorkstation = async () => {
      const workstation = await this.docker.createContainer({
        name: workstationName,
        Hostname: "workstation",
        Image: this.config.toolsImage,
        Cmd: ["workstation"],
        Env: [`TTYD_CREDENTIAL=${credential}`, clusterEnv],
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
      return workstation;
    };
    const [clusterEntries, grader, workstation] = await Promise.all([Promise.all(clusterNames.map(startCluster)), startGrader(), startWorkstation()]);
    const clusters: Record<string, string> = Object.fromEntries(clusterEntries);

    const resources: DockerResources = {
      provider: "local-docker",
      network,
      volume,
      containers: { clusters, grader: grader.id, workstation: workstation.id },
      terminal: { host: workstationName, port: TTYD_PORT, credential },
    };
    if (this.config.reach === "host") {
      const info = await workstation.inspect();
      const binding = info.NetworkSettings.Ports[`${TTYD_PORT}/tcp`]?.[0];
      if (!binding) throw new Error("the workstation's terminal port was not published");
      resources.terminal = { host: "127.0.0.1", port: Number(binding.HostPort), credential };
    }

    await ctx.onStep("api", plural ? "Waiting for every cluster's API and node" : "Waiting for the Kubernetes API and the node");
    await Promise.all(
      clusterNames.map(async (name) => {
        const kc = `KUBECONFIG=$HOME/.kube/clusters/${name}.yaml`;
        await this.waitFor(sessionId, resources, `${kc} kubectl get --raw /readyz >/dev/null 2>&1`, 240_000, `the Kubernetes API of ${name} did not become ready`);
        await this.waitFor(
          sessionId,
          resources,
          `${kc} kubectl get nodes -o name 2>/dev/null | grep -q . && ${kc} kubectl wait --for=condition=Ready nodes --all --timeout=5s >/dev/null 2>&1`,
          180_000,
          `the node of ${name} did not become Ready`,
        );
      }),
    );

    // k3s imports the cached archives before its node turns Ready; anything it did not get is streamed in now.
    await ctx.onStep("load-images", cache ? "Checking the images in each cluster" : `Loading ${labImages.length} image${labImages.length === 1 ? "" : "s"} into ${plural ? "each cluster" : "the cluster"}`);
    if (labImages.length > 0) {
      await Promise.all(
        Object.values(clusters).map(async (id) => {
          const missing = cache ? await this.missingImages(id, labImages) : labImages;
          if (cache && missing.length > 0) console.warn(`[labs] ${missing.length} cached image(s) were not imported at boot; streaming them in: ${missing.join(", ")}`);
          if (missing.length > 0) await this.importImages(id, missing);
        }),
      );
    }

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

  /**
   * The image cache: one folder per set of images (keyed by their image ids, so a rebuilt or re-pulled image
   * gets a new folder) in the `lfct-image-cache` volume, holding one `docker save` archive per image. Built by a
   * short-lived helper container the first time a set is needed, then reused by every boot. Folders unused for
   * 14 days are removed. Returns the folder name, or null to fall back to streaming the images in.
   */
  private async imageCache(images: string[]): Promise<string | null> {
    if (!this.config.imageCache || images.length === 0) return null;
    let key: string;
    try {
      const ids = await Promise.all(images.map(async (i) => `${i}@${(await this.docker.getImage(i).inspect()).Id}`));
      key = createHash("sha256").update(ids.sort().join("\n")).digest("hex").slice(0, 16);
    } catch (err) {
      console.warn(`[labs] image cache skipped: ${(err as Error).message}`);
      return null;
    }
    let pending = this.cacheBuilds.get(key);
    if (!pending) {
      pending = this.buildImageCache(key, images).catch((err: Error) => {
        console.warn(`[labs] could not build the image cache; streaming images instead (${err.message})`);
        this.cacheBuilds.delete(key);
        return null;
      });
      this.cacheBuilds.set(key, pending);
    }
    return pending;
  }

  private async buildImageCache(key: string, images: string[]): Promise<string | null> {
    await this.docker.createVolume({ Name: IMAGE_CACHE_VOLUME, Labels: { [LABEL_MANAGED]: "true", [LABEL_ROLE]: "image-cache" } });
    const helper = await this.docker.createContainer({
      Image: this.config.toolsImage,
      Entrypoint: ["sleep", "900"],
      User: "root",
      Labels: { [LABEL_MANAGED]: "true", [LABEL_ROLE]: "image-cache" },
      HostConfig: { Binds: [`${IMAGE_CACHE_VOLUME}:/cache`], AutoRemove: true, NetworkMode: "none" },
    });
    await helper.start();
    try {
      const sh = (script: string, stdinStream?: NodeJS.ReadableStream) =>
        this.execRaw(helper.id, ["sh", "-c", script], { timeoutMs: 600_000, user: "root", ...(stdinStream ? { stdinStream } : {}) });
      if ((await sh(`test -f /cache/${key}/.complete && touch /cache/${key}`)).exitCode === 0) return key;
      const tmp = `/cache/.${key}.${process.pid}.${Date.now()}`;
      await sh(`mkdir -p ${tmp}`);
      let saved = 0;
      for (const [i, image] of images.entries()) {
        const errors: string[] = [];
        for (const options of this.saveOptions(image)) {
          try {
            const tar = await this.saveImage(options);
            const out = await sh(`cat > ${tmp}/${i}.tar`, tar);
            if (out.exitCode !== 0) throw new Error(out.output.trim().slice(-300));
            errors.length = 0;
            saved++;
            break;
          } catch (err) {
            errors.push((err as Error).message);
          }
        }
        if (errors.length > 0) {
          await sh(`rm -f ${tmp}/${i}.tar`);
          console.warn(`[labs] could not cache ${image}; it will be streamed in instead (${errors.join("; ")})`);
        }
      }
      if (saved === 0) {
        await sh(`rm -rf ${tmp}`);
        return null;
      }
      const done = await sh(
        `touch ${tmp}/.complete && rm -rf /cache/${key} && mv ${tmp} /cache/${key} && find /cache -mindepth 1 -maxdepth 1 -mtime +14 -exec rm -rf {} +; true`,
      );
      if (done.exitCode !== 0) throw new Error(done.output.trim().slice(-300));
      console.log(`[labs] cached ${saved} image(s) for fast boots (${key})`);
      return key;
    } finally {
      await helper.remove({ force: true }).catch(() => undefined);
    }
  }

  /** Images a cluster's containerd does not have yet, comparing fully qualified references. */
  private async missingImages(clusterId: string, images: string[]): Promise<string[]> {
    const out = await this.execRaw(clusterId, ["ctr", "-n", "k8s.io", "images", "ls", "-q"], { timeoutMs: 30_000 });
    if (out.exitCode !== 0) return images;
    const have = new Set(out.output.split("\n").map((l) => l.trim()));
    return images.filter((i) => !have.has(qualifiedImage(i)));
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
      await sleep(500);
    }
    throw new Error(message);
  }

  /**
   * Streams `docker save` of each image into a cluster's containerd: the fallback when the image cache is off
   * or missed an image. An image Docker cannot export in a form containerd accepts is skipped with a warning,
   * and k3s pulls it from its registry instead.
   */
  private async importImages(clusterId: string, images: string[]): Promise<void> {
    for (const image of images) {
      const failures: string[] = [];
      for (const options of this.saveOptions(image)) {
        try {
          const tar = await this.saveImage(options);
          const result = await this.execRaw(clusterId, ["ctr", "-n", "k8s.io", "images", "import", "-"], { stdinStream: tar, timeoutMs: 600_000 });
          if (result.exitCode !== 0) throw new Error(result.output.trim().slice(-300));
          failures.length = 0;
          break;
        } catch (err) {
          failures.push((err as Error).message);
        }
      }
      if (failures.length > 0) console.warn(`[labs] could not preload ${image}; k3s will pull it instead (${failures.join("; ")})`);
    }
  }

  /**
   * `docker save` options for one image. Docker's containerd image store references every platform unless
   * asked for one, so the host's platform is asked for first; some Docker versions refuse that filter, so the
   * second try goes without it.
   */
  private saveOptions(image: string): Record<string, unknown>[] {
    const arch = process.arch === "arm64" ? "arm64" : "amd64";
    return [{ names: [image], platform: JSON.stringify({ os: "linux", architecture: arch }) }, { names: [image] }];
  }

  private saveImage(options: Record<string, unknown>): Promise<NodeJS.ReadableStream> {
    return new Promise((resolve, reject) => {
      this.docker.modem.dial(
        { path: "/images/get?", options, method: "GET", isStream: true, statusCodes: { 200: true, 404: "image not found", 500: "server error" } },
        (err: Error | null, stream: unknown) => (err ? reject(err) : resolve(stream as NodeJS.ReadableStream)),
      );
    });
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

/** "nginx:1.27" -> "docker.io/library/nginx:1.27", as containerd lists it. */
export function qualifiedImage(ref: string): string {
  let name = ref;
  const first = name.split("/")[0]!;
  const hasRegistry = name.includes("/") && (first.includes(".") || first.includes(":") || first === "localhost");
  if (!hasRegistry) name = `docker.io/${name.includes("/") ? "" : "library/"}${name}`;
  const last = name.slice(name.lastIndexOf("/") + 1);
  if (!last.includes(":") && !name.includes("@")) name += ":latest";
  return name;
}
