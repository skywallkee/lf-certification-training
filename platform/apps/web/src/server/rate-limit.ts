import "server-only";
import { headers } from "next/headers";

/**
 * A small fixed-window rate limiter kept in this server's memory, for the auth forms. Better Auth limits its own
 * HTTP endpoints, but the forms call `auth.api.*` directly from server actions, which skips that limiter, so
 * without this a script could try passwords against one account as fast as the server answers.
 *
 * Memory is enough for the single web container this app runs as; several replicas would need a shared store.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
const MAX_KEYS = 10_000;

export interface Limit {
  /** Attempts allowed per window. */
  max: number;
  windowMs: number;
}

/** Sign-in and password checks: 10 tries per account and 30 per address in 15 minutes. */
export const PASSWORD_ATTEMPTS: Limit = { max: 10, windowMs: 15 * 60_000 };
export const PASSWORD_ATTEMPTS_PER_IP: Limit = { max: 30, windowMs: 15 * 60_000 };
/** Anything that sends an email: 5 per address (email) and 20 per client in an hour. */
export const EMAIL_SENDS: Limit = { max: 5, windowMs: 60 * 60_000 };
export const EMAIL_SENDS_PER_IP: Limit = { max: 20, windowMs: 60 * 60_000 };

/**
 * Counts one attempt for `key` and returns true while it is within the limit. Returns false (blocked) once the
 * window is used up, until it resets.
 */
export function hit(key: string, limit: Limit, now = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    if (windows.size >= MAX_KEYS) prune(now);
    windows.set(key, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }
  w.count += 1;
  return w.count <= limit.max;
}

/** True when `key` has used up its window, without counting an attempt. */
export function isBlocked(key: string, limit: Limit, now = Date.now()): boolean {
  const w = windows.get(key);
  return Boolean(w && w.resetAt > now && w.count >= limit.max);
}

/** Forgets a key, for example after a successful sign-in. */
export function clear(key: string): void {
  windows.delete(key);
}

function prune(now: number) {
  for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  // Still full of live windows: drop the oldest entries rather than grow without bound.
  if (windows.size >= MAX_KEYS) {
    for (const k of [...windows.keys()].slice(0, Math.ceil(MAX_KEYS / 10))) windows.delete(k);
  }
}

/** The client's address as the web server saw it (the first X-Forwarded-For hop), or "unknown". */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** For tests. */
export function resetRateLimits(): void {
  windows.clear();
}
