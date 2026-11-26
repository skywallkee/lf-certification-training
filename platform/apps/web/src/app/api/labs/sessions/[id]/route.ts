import { NextResponse } from "next/server";
import * as z from "zod";
import { getSession } from "@/server/labs";
import { getUser } from "@/server/session";

/** Session status for the lab player's polling. Owner only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not found" }, { status: 404 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const s = await getSession(id, user.id);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(
    {
      status: s.status,
      bootStep: s.bootStep,
      statusMessage: s.statusMessage,
      expiresAt: s.expiresAt?.toISOString() ?? null,
      extended: s.extended,
      mode: s.mode,
      startedAt: s.startedAt?.toISOString() ?? null,
      ending: s.endingAt !== null,
      now: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
