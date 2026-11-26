import { createHmac } from "node:crypto";

/**
 * The bearer token for POST /api/reminders/run. REMINDERS_SECRET when set (for an outside scheduler later),
 * otherwise derived from the auth secret, so the built-in scheduler needs no extra setting.
 */
export function remindersSecret(): string {
  if (process.env.REMINDERS_SECRET) return process.env.REMINDERS_SECRET;
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "").update("reminders-run").digest("base64url");
}
