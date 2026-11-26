import { NextResponse } from "next/server";
import { turnOffReminders, verifyUnsubscribe } from "@/server/unsubscribe";

/** One-click unsubscribe (RFC 8058): mail apps POST here from the List-Unsubscribe header. */
export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const userId = verifyUnsubscribe(params.get("u"), params.get("t"));
  if (!userId) return NextResponse.json({ error: "invalid link" }, { status: 400 });
  await turnOffReminders(userId);
  return NextResponse.json({ ok: true });
}
