import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { domainTrends, trendSummary } from "@lfct/labs";
import { SessionStatus } from "@/components/labs/session-status";
import { LocalTime } from "@/components/local-time";
import { ScoreTrend, Sparkline } from "@/components/mocks/score-trend";
import { PageHeader } from "@/components/page-header";
import { SampleBadge } from "@/components/status-chip";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getCatalog } from "@/server/catalog";
import { getHistory } from "@/server/labs";
import { domainName, getMockHistory, listMocks } from "@/server/mocks";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Mock exam history" };

/**
 * Every mock exam attempt, with a score trend per mock (line over the graded attempts, pass mark, exam vs
 * practice markers), how each domain moved from the first attempt to the latest, and the full attempts table.
 */
export default async function MockHistoryPage() {
  const user = await requireUser("/mocks/history");
  const [history, attempts, mocks, catalog] = await Promise.all([getMockHistory(user.id), getHistory(user.id, "mock"), listMocks(), getCatalog()]);
  const titles = new Map(mocks.map((m) => [m.id, m.title]));

  return (
    <>
      <PageHeader title="Mock exam history" eyebrow={<Link href="/mocks">Mock exams</Link>} lead="Your scores over time, how each domain is moving, and every attempt." />
      <div className="flex flex-col gap-6">
        {history.length === 0 ? (
          <Card>
            <p className="text-[15px] text-muted-foreground">
              No graded attempts yet. <Link href="/mocks">Take a mock exam</Link> and your score trend starts here.
            </p>
          </Card>
        ) : (
          history.map(({ mock, graded }) => {
            const summary = trendSummary(graded);
            const domains = domainTrends(graded);
            const passMark = mock.passPercent ?? 66;
            const cert = catalog.certs.get(mock.certCode);
            const weakest = domains[0];
            return (
              <Card key={mock.id} aria-labelledby={`trend-${mock.id}`} className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle id={`trend-${mock.id}`}>
                    <Link href={`/mocks/${mock.id}`}>{mock.title}</Link>
                  </CardTitle>
                  {mock.mock ? <SampleBadge /> : null}
                </div>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Latest">
                    <span className={cn(summary.latest! >= passMark && "text-success")}>{summary.latest}%</span>
                    <Change value={summary.change} suffix="vs the attempt before" />
                  </Stat>
                  <Stat label="Best">{summary.best}%</Stat>
                  <Stat label="Average">{summary.average}%</Stat>
                  <Stat label="Passed">
                    {summary.passed} of {summary.attempts}
                  </Stat>
                </dl>
                <ScoreTrend title={mock.title} passMark={passMark} points={graded.map((g) => ({ id: g.id, at: g.at.toISOString(), score: g.score, mode: g.mode }))} />
                {domains.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold">By domain, first attempt to latest</h3>
                    <div className="relative mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Scores by domain, scrolls sideways on small screens">
                      <table className="w-full min-w-[320px] text-left text-sm">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th scope="col" className="py-2 font-semibold">Domain</th>
                            <th scope="col" className="py-2 font-semibold">
                              <span className="sr-only">Trend</span>
                            </th>
                            <th scope="col" className="py-2 font-semibold">First</th>
                            <th scope="col" className="py-2 font-semibold">Latest</th>
                            <th scope="col" className="py-2 font-semibold">Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {domains.map((d) => (
                            <tr key={d.domain} className="border-t">
                              <td className="py-2 pr-2">{domainName(cert, d.domain)}</td>
                              <td className="py-2 pr-2">
                                <Sparkline values={d.percents} />
                              </td>
                              <td className="py-2">{d.first === null ? "–" : `${d.first}%`}</td>
                              <td className={cn("py-2 font-semibold", d.latest !== null && d.latest < passMark && "text-warning")}>{d.latest === null ? "–" : `${d.latest}%`}</td>
                              <td className="py-2">
                                <Change value={d.change} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {weakest && weakest.latest !== null && weakest.latest < 100 ? (
                      <p className="mt-3 text-sm">
                        Weakest now: <strong>{domainName(cert, weakest.domain)}</strong>.{" "}
                        <Link href={`/certs/${mock.certCode.toLowerCase()}/domains/${weakest.domain}`}>Study this domain</Link> or{" "}
                        <Link href="/labs">practise it in a lab</Link>.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            );
          })
        )}

        <Card aria-labelledby="all-attempts" className="relative overflow-x-auto p-0">
          <CardTitle id="all-attempts" className="px-5 pt-5">
            All attempts
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
                {attempts.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-5 py-3">
                      <Link href={`/mocks/results/${a.id}`}>{titles.get(a.labId) ?? a.labId}</Link>
                    </td>
                    <td className="px-5 py-3">{a.mode === "exam" ? "Exam" : "Practice"}</td>
                    <td className="px-5 py-3">
                      <LocalTime value={a.startedAt ?? a.createdAt} />
                    </td>
                    <td className="px-5 py-3">
                      <SessionStatus status={a.status} />
                    </td>
                    <td className="px-5 py-3">{a.score === null ? "–" : `${a.score}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="flex flex-col items-start gap-1 text-2xl font-bold">{children}</dd>
    </div>
  );
}

/** "+12" with an up arrow, "−5" with a down arrow, "no change"; words carry the meaning, not color alone. */
function Change({ value, suffix }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-sm font-normal text-muted-foreground">–</span>;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : ArrowRight;
  const text = value === 0 ? "no change" : `${value > 0 ? "+" : "−"}${Math.abs(value)} points`;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-0.5 text-sm font-semibold", value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground")}>
      <Icon aria-hidden="true" className="size-4" />
      {text}
      {suffix ? <span className="ml-1 font-normal text-muted-foreground">{suffix}</span> : null}
    </span>
  );
}
