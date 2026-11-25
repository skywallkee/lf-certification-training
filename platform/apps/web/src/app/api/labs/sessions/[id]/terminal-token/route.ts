import { NextResponse } from "next/server";
import * as z from "zod";
import { signTerminalToken } from "@lfct/labs";
import { env } from "@/env";
import { getSession } from "@/server/labs";
import { getUser } from "@/server/session";

/**
 * A two-minute token for the terminal WebSocket, for the signed-in owner of a running session. The player asks
 * for a fresh one on every (re)connect, so tokens never need to live long.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not found" }, { status: 404 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const s = await getSession(id, user.id);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (s.status !== "ready") return NextResponse.json({ error: "not running", status: s.status }, { status: 409 });
  if (s.mode !== "lab" && !s.startedAt) return NextResponse.json({ error: "not started", status: s.status }, { status: 409 });
  const token = signTerminalToken({ sid: s.id, uid: user.id }, env.labs.tokenSecret);
  const url = `${env.labs.terminalUrl.replace(/\/$/, "")}/terminal/${s.id}?token=${encodeURIComponent(token)}`;
  return NextResponse.json({ url }, { headers: { "cache-control": "no-store" } });
}
