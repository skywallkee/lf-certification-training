import type { SlotDecision } from "./capacity.ts";

/**
 * Lab allowance. Each learner gets a monthly allowance of lab minutes (calendar month, UTC) and one active
 * session at a time; the platform has a ceiling on concurrent sessions (local Docker capacity now, the cloud
 * spending cap later). A session counts from the moment its terminal is ready until it ends, so boot time and
 * failed boots are free.
 */

export interface UsageRow {
  readyAt: Date | null;
  endedAt: Date | null;
  expiresAt: Date | null;
}

export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Minutes used this month. A running session counts up to now (never past its expiry). */
export function minutesUsed(rows: UsageRow[], now: Date): number {
  const from = monthStart(now).getTime();
  let ms = 0;
  for (const r of rows) {
    if (!r.readyAt) continue;
    let end = (r.endedAt ?? now).getTime();
    if (r.expiresAt) end = Math.min(end, r.expiresAt.getTime());
    const start = Math.max(r.readyAt.getTime(), from);
    if (end > start) ms += end - start;
  }
  return Math.ceil(ms / 60_000);
}

export type StartBlock =
  | { reason: "active-session"; sessionId: string }
  | { reason: "quota"; minutesLeft: number; resetsOn: Date }
  /** Every slot is taken or others are waiting: the learner can join the line (position null) or is in it. */
  | { reason: "capacity"; position: number | null; waiting: number }
  | { reason: "controller-down" };

export interface StartInput {
  labMinutes: number;
  minutesUsed: number;
  monthlyMinutes: number;
  activeSessionId: string | null;
  /** Room on the machine for this learner now (capacity.ts slotFor). */
  slot: SlotDecision;
  now: Date;
}

/**
 * Why a learner cannot start a lab, or null when they can. A lab needs its full length in the allowance, so a
 * learner never starts a session the quota would cut short.
 */
export function startBlock(input: StartInput): StartBlock | null {
  if (input.activeSessionId) return { reason: "active-session", sessionId: input.activeSessionId };
  const left = Math.max(0, input.monthlyMinutes - input.minutesUsed);
  if (left < input.labMinutes) return { reason: "quota", minutesLeft: left, resetsOn: nextMonthStart(input.now) };
  if (!input.slot.ok) return { reason: "capacity", position: input.slot.position, waiting: input.slot.waiting };
  return null;
}

/** The extension a learner can add once, in minutes. */
export const EXTEND_MINUTES = 15;
