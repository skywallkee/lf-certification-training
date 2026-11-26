import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { Timer } from "lucide-react";
import { MOCK_MODES, trendSummary } from "@lfct/labs";
import { PageHeader } from "@/components/page-header";
import { SessionStatus } from "@/components/labs/session-status";
import { SampleBadge } from "@/components/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { en } from "@/messages/en";
import { getCatalog } from "@/server/catalog";
import { getCapacity, getHistory } from "@/server/labs";
import { getMockAttemptsUsed, getMockHistory, listMocks, mockAllowance, usedFor } from "@/server/mocks";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Mock exams" };

export default async function MocksPage() {
  const user = await requireUser("/mocks");
  const [mocks, used, capacity, catalog, attempts, history] = await Promise.all([
    listMocks(),
    getMockAttemptsUsed(user.id),
    getCapacity(),
    getCatalog(),
    getHistory(user.id, "mock"),
    getMockHistory(user.id),
  ]);
  const trends = new Map(history.map((h) => [h.mock.id, trendSummary(h.graded)]));
  const recent = attempts.slice(0, 5);
  const byCert = new Map<string, typeof mocks>();
  for (const m of mocks) byCert.set(m.certCode, [...(byCert.get(m.certCode) ?? []), m]);
  const titles = new Map(mocks.map((m) => [m.id, m.title]));

  return (
    <>
      <PageHeader
        title={en.mocks.title}
        lead={en.mocks.lead}
        actions={
          <Link href="/mocks/history" className={buttonVariants({ variant: "outline", size: "sm" })}>
            History and score trends
          </Link>
        }
      />
      <div className="flex flex-col gap-6">
        {!capacity.controllerUp ? (
          <p role="status" className="rounded-md bg-warning-soft px-4 py-3 text-[15px]">
            {en.mocks.controllerDown}
          </p>
        ) : null}
        {mocks.length === 0 ? (
          <Card>
            <p className="text-[15px] text-muted-foreground">No mock exams yet. Run pnpm curriculum:ingest to load the sample mock exams.</p>
          </Card>
        ) : (
          [...byCert].map(([cert, list]) => (
            <section key={cert} aria-labelledby={`cert-${cert}`}>
              <h2 id={`cert-${cert}`} className="mb-1 text-lg font-semibold">
                {cert} · {catalog.certs.get(cert)?.name ?? ""}
              </h2>
              <p className="mb-3 text-sm text-muted-foreground">
                {MOCK_MODES.map((mode) => `${mode === "exam" ? en.mocks.examMode : en.mocks.practiceMode}: ${en.mocks.left(usedFor(used, cert, mode), mockAllowance(mode))}`).join(" · ")}
              </p>
              <ul className="grid gap-4 lg:grid-cols-2">
                {list.map((m) => (
                  <li key={m.id}>
                    <Card className="flex h-full flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Timer aria-hidden="true" className="size-4 text-primary" />
                        <h3 className="text-base font-semibold">
                          <Link href={`/mocks/${m.id}`}>{m.title}</Link>
                        </h3>
                        {m.mock ? <SampleBadge /> : null}
                      </div>
                      <p className="text-[15px] text-muted-foreground">{m.summary}</p>
                      <p className="text-sm">
                        {m.minutes} min · {m.tasks.length} tasks · {m.clusters.length} cluster{m.clusters.length === 1 ? "" : "s"} · pass mark {m.passPercent ?? 66}%
                      </p>
                      <MockTrendLine summary={trends.get(m.id)} passMark={m.passPercent ?? 66} />
                      <div className="mt-auto">
                        <Link href={`/mocks/${m.id}`} className={buttonVariants({ variant: "outline" })}>
                          Details and start
                        </Link>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        <Card aria-labelledby="attempts" className="overflow-x-auto p-0">
          <CardTitle id="attempts" className="px-5 pt-5">
            Recent attempts
          </CardTitle>
          {attempts.length === 0 ? (
            <p className="px-5 pb-5 pt-2 text-[15px] text-muted-foreground">No attempts yet.</p>
          ) : (
            <table className="mt-2 w-full min-w-[640px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Mock exam</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Mode</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Started</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Score</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-5 py-3">
                      <Link href={`/mocks/results/${a.id}`}>{titles.get(a.labId) ?? a.labId}</Link>
                    </td>
                    <td className="px-5 py-3">{a.mode === "exam" ? "Exam" : "Practice"}</td>
                    <td className="px-5 py-3"><LocalTime value={a.startedAt ?? a.createdAt} /></td>
                    <td className="px-5 py-3">
                      <SessionStatus status={a.status} />
                    </td>
                    <td className="px-5 py-3">{a.score === null ? "–" : `${a.score}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {attempts.length > 0 ? (
            <p className="border-t px-5 py-3 text-sm">
              <Link href="/mocks/history">All {attempts.length} attempts and your score trends</Link>
            </p>
          ) : null}
        </Card>
      </div>
    </>
  );
}

/** "Last 62% (+12) · best 75% · 1 pass in 3": the mock's own trend at a glance, or nothing before a graded attempt. */
function MockTrendLine({ summary, passMark }: { summary: ReturnType<typeof trendSummary> | undefined; passMark: number }) {
  if (!summary || summary.latest === null) return null;
  const change = summary.change;
  return (
    <p className="text-sm text-muted-foreground">
      Last <strong className={summary.latest >= passMark ? "text-success" : "text-foreground"}>{summary.latest}%</strong>
      {change !== null && change !== 0 ? ` (${change > 0 ? "+" : ""}${change} vs the attempt before)` : ""} · best {summary.best}% · {summary.passed} pass
      {summary.passed === 1 ? "" : "es"} in {summary.attempts}
    </p>
  );
}
