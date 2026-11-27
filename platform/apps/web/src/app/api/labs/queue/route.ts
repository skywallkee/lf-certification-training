import { NextResponse } from "next/server";
import { touchQueue } from "@/server/labs";
import { getUser } from "@/server/session";

/**
 * The waiting page checks in here every few seconds: it keeps the learner's place in line alive and answers
 * where they stand ({ queued: false } once they are no longer waiting). POST, because it changes the entry.
 */
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const entry = await touchQueue(user.id);
  return NextResponse.json(
    entry ? { queued: true, ...entry } : { queued: false },
    { headers: { "cache-control": "no-store" } },
  );
}
