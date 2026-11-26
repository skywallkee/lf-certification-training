import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import * as z from "zod";
import { parsePlayerState } from "@lfct/labs/player";
import { getDb } from "@/db";
import { labSession } from "@/db/schema";
import { getLab, getSession } from "@/server/labs";
import { getUser } from "@/server/session";

/**
 * Saves where the learner is in a running lab or mock exam (exercise, flags, panel), so a refresh, a closed
 * tab or another browser resumes there. POST, because the player also sends it with navigator.sendBeacon while
 * the page unloads. Owner only, active sessions only; the body is cleaned against the lab's task ids.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not found" }, { status: 404 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const text = await req.text();
  if (text.length > 8_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const session = await getSession(id, user.id);
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  const lab = await getLab(session.labId);
  if (!lab) return NextResponse.json({ error: "not found" }, { status: 404 });
  const state = parsePlayerState(body, lab.tasks.map((t) => t.id));
  const rows = await getDb()
    .update(labSession)
    .set({ playerState: state })
    .where(
      and(eq(labSession.id, id), eq(labSession.userId, user.id), sql`${labSession.status} in ('requested', 'booting', 'ready')`, isNull(labSession.endingAt)),
    )
    .returning({ id: labSession.id });
  return NextResponse.json({ saved: rows.length > 0 }, { headers: { "cache-control": "no-store" } });
}
