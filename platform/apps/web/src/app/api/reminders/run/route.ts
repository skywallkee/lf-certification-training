import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { remindersSecret } from "@/lib/cron-secret";
import { runReminders } from "@/server/reminders";

/** Sends the study reminder emails that are due. Called by the built-in scheduler (instrumentation-node.ts). */
export async function POST(request: Request) {
  const want = Buffer.from(`Bearer ${remindersSecret()}`);
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  if (want.length !== got.length || !timingSafeEqual(want, got)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runReminders();
  return NextResponse.json(result);
}
