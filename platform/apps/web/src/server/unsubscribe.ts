import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profile } from "@/db/schema";
import { env } from "@/env";

/**
 * Unsubscribe links in reminder emails: the user id and an HMAC of it under the auth secret, so the link works
 * without signing in and cannot be made for another learner. It only ever turns reminders off.
 */
export type UnsubscribeKind = "reminders" | "discussions";

function sign(userId: string, kind: UnsubscribeKind = "reminders"): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  // Reminder links keep their original message so links already sent keep working.
  const message = kind === "reminders" ? `unsubscribe:${userId}` : `unsubscribe:${kind}:${userId}`;
  return createHmac("sha256", secret).update(message).digest("base64url").slice(0, 32);
}

export function unsubscribeUrl(userId: string): string {
  const u = Buffer.from(userId).toString("base64url");
  return `${env.baseUrl}/unsubscribe?u=${u}&t=${sign(userId)}`;
}

/** The one-click (RFC 8058) endpoint that mail apps POST to. */
export function oneClickUrl(userId: string): string {
  const u = Buffer.from(userId).toString("base64url");
  return `${env.baseUrl}/api/unsubscribe?u=${u}&t=${sign(userId)}`;
}

/** Discussion emails carry their own link (k=discussions), which only turns discussion emails off. */
export function discussionsUnsubscribeUrl(userId: string): string {
  const u = Buffer.from(userId).toString("base64url");
  return `${env.baseUrl}/unsubscribe?k=discussions&u=${u}&t=${sign(userId, "discussions")}`;
}

export function discussionsOneClickUrl(userId: string): string {
  const u = Buffer.from(userId).toString("base64url");
  return `${env.baseUrl}/api/unsubscribe?k=discussions&u=${u}&t=${sign(userId, "discussions")}`;
}

export function unsubscribeKind(k: string | null | undefined): UnsubscribeKind {
  return k === "discussions" ? "discussions" : "reminders";
}

/** The user id when the token is valid, otherwise null. */
export function verifyUnsubscribe(u: string | null | undefined, t: string | null | undefined, kind: UnsubscribeKind = "reminders"): string | null {
  if (!u || !t || u.length > 200 || t.length > 64) return null;
  const userId = Buffer.from(u, "base64url").toString("utf8");
  if (!userId) return null;
  const want = Buffer.from(sign(userId, kind));
  const got = Buffer.from(t);
  return want.length === got.length && timingSafeEqual(want, got) ? userId : null;
}

export async function turnOffReminders(userId: string): Promise<void> {
  await getDb()
    .update(profile)
    .set({ remindWeekly: false, remindNudge: false, remindExam: false, updatedAt: new Date() })
    .where(eq(profile.userId, userId));
}

export async function turnOffDiscussionEmails(userId: string): Promise<void> {
  await getDb()
    .insert(profile)
    .values({ userId, notifyDiscussions: false })
    .onConflictDoUpdate({ target: profile.userId, set: { notifyDiscussions: false, updatedAt: new Date() } });
}

export async function unsubscribe(userId: string, kind: UnsubscribeKind): Promise<void> {
  if (kind === "discussions") await turnOffDiscussionEmails(userId);
  else await turnOffReminders(userId);
}
