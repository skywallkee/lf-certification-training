import { and, eq, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import * as z from "zod";
import { getDb } from "@/db";
import { labSession } from "@/db/schema";
import { getUser } from "@/server/session";

/**
 * Mock exams: the player reports each time the learner leaves the exam window (the page becomes hidden), with
 * navigator.sendBeacon so it arrives even while the tab closes. Counted only while a started attempt runs, and
 * shown on the results page only, as a nudge: nothing is proctored.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not found" }, { status: 404 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const rows = await getDb()
    .update(labSession)
    .set({ windowLeaves: sql`${labSession.windowLeaves} + 1` })
    .where(
      and(
        eq(labSession.id, id),
        eq(labSession.userId, user.id),
        eq(labSession.status, "ready"),
        isNotNull(labSession.startedAt),
        sql`${labSession.mode} <> 'lab'`,
      ),
    )
    .returning({ windowLeaves: labSession.windowLeaves });
  return NextResponse.json({ counted: rows.length > 0 }, { headers: { "cache-control": "no-store" } });
}
