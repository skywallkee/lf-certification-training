import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { outboxEmail } from "@/db/schema";
import { env } from "@/env";

export interface DevMail {
  /** The local mail catcher's inbox (Mailpit), when the stack runs one. */
  inboxUrl?: string;
  /** Development only: the link from the last matching email, read from the outbox. */
  link?: string;
}

/** What the check-your-email pages show on a local machine; empty in production. */
export async function devMail(to: string, subject: string): Promise<DevMail> {
  const inboxUrl = env.mail.inboxUrl;
  if (!env.showDevEmails || !to) return { inboxUrl };
  const [row] = await getDb()
    .select({ text: outboxEmail.text })
    .from(outboxEmail)
    .where(and(eq(outboxEmail.to, to), eq(outboxEmail.subject, subject)))
    .orderBy(desc(outboxEmail.id))
    .limit(1);
  return { inboxUrl, link: row?.text.match(/https?:\/\/\S+/)?.[0] };
}
