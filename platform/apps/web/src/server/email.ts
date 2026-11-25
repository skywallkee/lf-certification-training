import "server-only";
import { getDb } from "@/db";
import { outboxEmail } from "@/db/schema";

/**
 * Phase 1 has no mail provider (it would be the first running cost beyond the platform). Messages are
 * written to the outbox table and the server log; a provider plugs in here later.
 */
export async function sendEmail(message: { to: string; subject: string; text: string }): Promise<void> {
  await getDb().insert(outboxEmail).values(message);
  console.info(`[email] to=${message.to} subject="${message.subject}"\n${message.text}`);
}
