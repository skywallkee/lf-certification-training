import { NextResponse } from "next/server";
import { unsubscribe, unsubscribeKind, verifyUnsubscribe } from "@/server/unsubscribe";

/** One-click unsubscribe (RFC 8058): mail apps POST here from the List-Unsubscribe header. */
export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = unsubscribeKind(params.get("k"));
  const userId = verifyUnsubscribe(params.get("u"), params.get("t"), kind);
  if (!userId) return NextResponse.json({ error: "invalid link" }, { status: 400 });
  await unsubscribe(userId, kind);
  return NextResponse.json({ ok: true });
}
