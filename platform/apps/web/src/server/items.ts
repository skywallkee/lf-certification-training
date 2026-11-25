import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bookmark, note } from "@/db/schema";

export async function getItemState(userId: string, targetType: "lesson" | "question", ids: string[]) {
  if (ids.length === 0) return { saved: new Set<string>(), notes: new Map<string, string>() };
  const db = getDb();
  const [b, n] = await Promise.all([
    db.select({ id: bookmark.targetId }).from(bookmark).where(and(eq(bookmark.userId, userId), eq(bookmark.targetType, targetType), inArray(bookmark.targetId, ids))),
    db.select({ id: note.targetId, body: note.body }).from(note).where(and(eq(note.userId, userId), eq(note.targetType, targetType), inArray(note.targetId, ids))),
  ]);
  return { saved: new Set(b.map((r) => r.id)), notes: new Map(n.map((r) => [r.id, r.body])) };
}
