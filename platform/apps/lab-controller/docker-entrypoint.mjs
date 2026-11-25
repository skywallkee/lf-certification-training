/**
 * Container entry point for the lab controller (see the root Dockerfile). Runs the controller as the unprivileged
 * "node" user (uid/gid 1000) while keeping access to the mounted Docker socket.
 *
 * The socket's group differs by host (root on Docker Desktop, a host-specific "docker" gid on Linux), so when started
 * as root this adds that gid to the process's groups, drops to node, and only then loads the bundled controller.
 * Access to the Docker socket is root-equivalent on the host anyway; dropping root limits everything else.
 */
import console from "node:console";
import { statSync } from "node:fs";
import process from "node:process";

const NODE_UID = 1000;
const NODE_GID = 1000;

if (process.getuid?.() === 0) {
  const socket = process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock";
  const groups = [NODE_GID];
  try {
    groups.push(statSync(socket).gid);
  } catch {
    console.warn(`${socket} not found; starting without Docker socket access (fine for LAB_PROVIDER=fake).`);
  }
  process.setgroups([...new Set(groups)]);
  process.setgid(NODE_GID);
  process.setuid(NODE_UID);
  process.env.HOME = "/home/node";
}

await import("./lab-controller.mjs");
