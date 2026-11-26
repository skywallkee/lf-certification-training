import { desc, eq, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { ingestRun, question } from "@lfct/curriculum/db";
import { resolveFlagAction, setUserDisabledAction } from "@/app/actions/admin";
import { CoverageBadge } from "@/components/coverage-badge";
import { PageHeader } from "@/components/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { flag, user as userTable } from "@/db/schema";
import { certRefs, competencyPath, coverageOf, getCatalog } from "@/server/catalog";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Admin" };

const REASON: Record<string, string> = {
  "wrong-answer": "Marked answer is wrong",
  unclear: "Wording is unclear",
  "broken-link": "Broken link",
  typo: "Typo or formatting",
  other: "Something else",
};

export default async function AdminPage() {
  const admin = await requireAdmin();
  const db = getDb();
  const catalog = await getCatalog();
  const [runs, flags, known, users] = await Promise.all([
    db.select().from(ingestRun).orderBy(desc(ingestRun.id)).limit(5),
    db.select().from(flag).where(eq(flag.status, "open")).orderBy(desc(flag.createdAt)).limit(50),
    db.select({ id: question.id, issue: question.knownIssue, refs: question.competencyRefs }).from(question).where(isNotNull(question.knownIssue)),
    db
      .select({ id: userTable.id, name: userTable.name, email: userTable.email, role: userTable.role, banned: userTable.banned, createdAt: userTable.createdAt })
      .from(userTable)
      .orderBy(desc(userTable.createdAt))
      .limit(100),
  ]);
  const describe = (type: string, id: string) => {
    if (type === "lesson") {
      const l = catalog.lessonsById.get(id);
      return l ? { label: `Lesson: ${l.title}`, href: `/admin/content/lesson/${encodeURIComponent(id)}` } : { label: `Lesson ${id} (removed)`, href: null };
    }
    return { label: `Question ${id}`, href: `/admin/content/question/${encodeURIComponent(id)}` };
  };
  const certs = [...catalog.certs.values()].sort((a, b) => a.code.localeCompare(b.code));
  return (
    <>
      <PageHeader
        title="Admin"
        lead="Content, ingest, coverage, reported problems and users."
        actions={
          <>
            <Link href="/admin/content" className="text-sm font-medium">
              Content: create and edit
            </Link>
            <Link href="/admin/labs" className="text-sm font-medium">
              Labs: sessions and spend
            </Link>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="ingest">
          <CardTitle id="ingest">Content ingest</CardTitle>
          {runs.length === 0 ? (
            <p className="mt-2 text-[15px] text-muted-foreground">No ingest has run yet. Run pnpm curriculum:ingest.</p>
          ) : (
            <div className="relative mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 font-semibold">Started</th>
                    <th scope="col" className="py-2 font-semibold">Result</th>
                    <th scope="col" className="py-2 font-semibold">New curriculum versions</th>
                    <th scope="col" className="py-2 font-semibold">Lessons</th>
                    <th scope="col" className="py-2 font-semibold">Questions</th>
                    <th scope="col" className="py-2 font-semibold">Labs</th>
                    <th scope="col" className="py-2 font-semibold">Sample set</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2">{r.startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</td>
                      <td className={`py-2 font-medium ${r.ok ? "text-success" : "text-destructive"}`}>{r.ok ? "OK" : r.finishedAt ? `Failed: ${r.message ?? ""}` : "Running"}</td>
                      <td className="py-2">{r.curriculumVersionsAdded}</td>
                      <td className="py-2">{r.lessons}</td>
                      <td className="py-2">{r.questions}</td>
                      <td className="py-2">{r.labs}</td>
                      <td className="py-2">{r.includeSample ? "Included" : "Left out"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card aria-labelledby="flags">
          <CardTitle id="flags">Reported problems</CardTitle>
          {flags.length === 0 && known.length === 0 ? (
            <p className="mt-2 text-[15px] text-muted-foreground">Nothing reported. Learners use Flag a problem on lessons and questions.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {known.map((k) => (
                <li key={`known-${k.id}`} className="flex flex-col gap-1 py-3">
                  <span className="text-sm font-semibold text-warning">Known issue in content</span>
                  <span>
                    <Link href={`/admin/content/question/${encodeURIComponent(k.id)}`}>Question {k.id}</Link> · <Link href={competencyPath(k.refs[0]!)}>its competency</Link>
                  </span>
                  <span className="text-sm text-muted-foreground">{k.issue} Fix it in the editor (and clear the known issue) or in content/; it is left out of quizzes meanwhile.</span>
                </li>
              ))}
              {flags.map((f) => {
                const d = describe(f.targetType, f.targetId);
                return (
                  <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <span className="flex flex-col gap-1">
                      <span className="text-sm font-semibold">{REASON[f.reason] ?? f.reason}</span>
                      {d.href ? <Link href={d.href}>{d.label}</Link> : <span>{d.label}</span>}
                      {f.details ? <span className="text-sm">&ldquo;{f.details}&rdquo;</span> : null}
                      <span className="text-xs text-muted-foreground">{f.createdAt.toISOString().slice(0, 10)}</span>
                    </span>
                    <form action={resolveFlagAction}>
                      <input type="hidden" name="flagId" value={f.id} />
                      <button type="submit" className="min-h-6 text-sm text-primary hover:underline">
                        Mark resolved
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="coverage">
          <CardTitle id="coverage">Coverage by cert</CardTitle>
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 font-semibold">Cert</th>
                  <th scope="col" className="py-2 font-semibold">Competencies</th>
                  <th scope="col" className="py-2 font-semibold">With lessons</th>
                  <th scope="col" className="py-2 font-semibold">With questions</th>
                  <th scope="col" className="py-2 font-semibold">State</th>
                </tr>
              </thead>
              <tbody>
                {certs.map((c) => {
                  const cov = coverageOf(catalog, certRefs(c));
                  return (
                    <tr key={c.code} className="border-t">
                      <td className="py-2">
                        <Link href={`/certs/${c.code.toLowerCase()}`}>{c.code}</Link>
                      </td>
                      <td className="py-2">{cov.competencies}</td>
                      <td className="py-2">{cov.withLessons}</td>
                      <td className="py-2">{cov.withQuestions}</td>
                      <td className="py-2">
                        <CoverageBadge coverage={cov} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">The coverage_gaps tool of the curriculum MCP lists each missing competency, heaviest domains first.</p>
        </Card>

        <Card aria-labelledby="users">
          <CardTitle id="users">Users</CardTitle>
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 font-semibold">Name</th>
                  <th scope="col" className="py-2 font-semibold">Email</th>
                  <th scope="col" className="py-2 font-semibold">Role</th>
                  <th scope="col" className="py-2 font-semibold">Joined</th>
                  <th scope="col" className="py-2 font-semibold">Access</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="py-2">{u.name}</td>
                    <td className="py-2">{u.email}</td>
                    <td className="py-2">{u.role ?? "user"}</td>
                    <td className="py-2">{u.createdAt.toISOString().slice(0, 10)}</td>
                    <td className="py-2">
                      {u.id === admin.id ? (
                        <span className="text-muted-foreground">You</span>
                      ) : (
                        <form action={setUserDisabledAction} className="flex items-center gap-3">
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="disable" value={u.banned ? "0" : "1"} />
                          <span className={u.banned ? "font-medium text-destructive" : "text-success"}>{u.banned ? "Disabled" : "Active"}</span>
                          <button type="submit" className="min-h-6 text-primary hover:underline">
                            {u.banned ? "Enable" : "Disable"}
                            <span className="sr-only"> {u.email}</span>
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
