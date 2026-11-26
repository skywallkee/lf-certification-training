import "server-only";
import { createTransport, type Transporter } from "nodemailer";
import { getDb } from "@/db";
import { outboxEmail } from "@/db/schema";
import { env } from "@/env";

let transport: Transporter | undefined;

function smtp(): Transporter | undefined {
  if (!env.mail.smtpUrl) return undefined;
  transport ??= createTransport(env.mail.smtpUrl);
  return transport;
}

/**
 * Every message is written to the outbox table and the server log. When SMTP_URL is set it is also sent over
 * SMTP: locally that is the Mailpit container (inbox at http://localhost:8025), later a real provider. A send
 * that fails is logged and does not fail the request, since the outbox still holds the message.
 */
export async function sendEmail(message: { to: string; subject: string; text: string }): Promise<void> {
  await getDb().insert(outboxEmail).values(message);
  const mailer = smtp();
  if (!mailer) {
    console.info(`[email] to=${message.to} subject="${message.subject}"\n${message.text}`);
    return;
  }
  try {
    await mailer.sendMail({ from: env.mail.from, ...message });
    console.info(`[email] sent to=${message.to} subject="${message.subject}"`);
  } catch (err) {
    console.error(`[email] SMTP send failed to=${message.to} subject="${message.subject}"`, err);
  }
}
