import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getDb } from "@/db";
import { outboxEmail } from "@/db/schema";
import { env } from "@/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

let transport: Transporter | undefined;

function getTransport(): Transporter | undefined {
  if (!env.mail.smtpUrl) return undefined;
  transport ??= nodemailer.createTransport(env.mail.smtpUrl);
  return transport;
}

/**
 * Sends an email over SMTP when SMTP_URL is set (the local Docker stack points it at the Mailpit inbox), and
 * always keeps a copy in the outbox table as an audit trail. Without SMTP_URL the outbox and the server log are
 * the only record, as in Phase 1.
 *
 * A failed send is logged and does not throw: the caller (sign-up, sign-in) has already done its work, and the
 * learner can ask for the link again.
 */
export async function sendEmail(message: EmailMessage): Promise<{ delivered: boolean }> {
  await getDb().insert(outboxEmail).values(message);
  const smtp = getTransport();
  if (!smtp) {
    console.info(`[email] no SMTP_URL, outbox only: to=${message.to} subject="${message.subject}"\n${message.text}`);
    return { delivered: false };
  }
  try {
    await smtp.sendMail({ from: env.mail.from, to: message.to, subject: message.subject, text: message.text });
    console.info(`[email] sent to=${message.to} subject="${message.subject}"`);
    return { delivered: true };
  } catch (error) {
    console.error(`[email] SMTP send failed to=${message.to} subject="${message.subject}":`, error);
    return { delivered: false };
  }
}
