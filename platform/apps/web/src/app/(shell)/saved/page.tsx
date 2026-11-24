import { desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { question } from "@lfct/curriculum/db";
import { toggleBookmarkAction } from "@/app/actions/study";
import { PageHeader } from "@/components/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { bookmark, note } from "@/db/schema";
import { competencyPath, getCatalog } from "@/server/catalog";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Saved" };

export default async function SavedPage() {
  const user = await requireUser("/saved");
  const db = getDb();
  const catalog = await getCatalog();
  const [marks, notes] = await Promise.all([
    db.select().from(bookmark).where(eq(bookmark.userId, user.id)).orderBy(desc(bookmark.createdAt)),
    db.select().from(note).where(eq(note.userId, user.id)).orderBy(desc(note.updatedAt)),
  ]);
  const qIds = [...marks, ...notes].filter((x) => x.targetType === "question").map((x) => x.targetId);
  const qs = qIds.length ? await db.select({ id: question.id, stem: question.stem, refs: question.competencyRefs }).from(question).where(inArray(question.id, qIds)) : [];
  const qById = new Map(qs.map((q) => [q.id, q]));
  const describe = (t: "lesson" | "question", id: string) => {
    if (t === "lesson") {
      const l = catalog.lessonsById.get(id);
      return l ? { title: l.title, href: competencyPath(l.competencyRefs[0]!), kind: `${l.certCode} lesson` } : null;
    }
    const q = qById.get(id);
    return q ? { title: q.stem.replace(/```[\s\S]*?```/g, "").replace(/[`*]/g, "").slice(0, 120), href: competencyPath(q.refs[0]!), kind: "Question" } : null;
  };
  return (
    <>
      <PageHeader title="Saved" lead="Lessons and questions you saved, and your private notes." />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="bookmarks">
          <CardTitle id="bookmarks">Saved items</CardTitle>
          {marks.length === 0 ? (
            <p className="mt-2 text-[15px] text-muted-foreground">Nothing saved yet. Use Save on a lesson to keep it here.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {marks.map((m) => {
                const d = describe(m.targetType, m.targetId);
                if (!d) return null;
                return (
                  <li key={`${m.targetType}-${m.targetId}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="flex flex-col">
                      <Link href={d.href}>{d.title}</Link>
                      <span className="text-sm text-muted-foreground">{d.kind}</span>
                    </span>
                    <form action={toggleBookmarkAction}>
                      <input type="hidden" name="targetType" value={m.targetType} />
                      <input type="hidden" name="targetId" value={m.targetId} />
                      <input type="hidden" name="back" value="/saved" />
                      <button type="submit" className="min-h-6 text-sm text-primary hover:underline">
                        Remove<span className="sr-only"> {d.title}</span>
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card aria-labelledby="notes">
          <CardTitle id="notes">Notes</CardTitle>
          {notes.length === 0 ? (
            <p className="mt-2 text-[15px] text-muted-foreground">No notes yet. Notes you write under a lesson show up here.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {notes.map((n) => {
                const d = describe(n.targetType, n.targetId);
                if (!d) return null;
                return (
                  <li key={`${n.targetType}-${n.targetId}`} className="flex flex-col gap-1 py-3">
                    <Link href={d.href}>{d.title}</Link>
                    <p className="whitespace-pre-wrap text-[15px]">{n.body}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
