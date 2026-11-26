import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { WeeklyBars } from "@/components/admin/weekly-bars";
import { PageHeader } from "@/components/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { MIN_DOMAIN_EVIDENCE, MIN_QUESTION_ANSWERS, parseRange, percent, RANGE_WEEKS, type UsageRow } from "@/lib/analytics";
import { formatShort, todayIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getAnalytics } from "@/server/analytics";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Admin: analytics" };

const num = new Intl.NumberFormat("en");
const pct = (v: number | null) => (v === null ? "–" : `${v}%`);

function Stat({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-[26px] font-bold leading-tight tabular-nums">{value}</dd>
      {note ? <dd className="text-[13px] text-muted-foreground">{note}</dd> : null}
    </div>
  );
}

/** Accuracy as text beside a short bar (the bar is decorative; the number carries the value). */
function Accuracy({ value }: { value: number }) {
  const v = Math.round(value * 100);
  return (
    <span className="flex items-center gap-2">
      <span className="w-10 text-right tabular-nums">{v}%</span>
      <span aria-hidden="true" className="h-2 w-24 shrink-0 rounded-full bg-muted">
        <span className="block h-2 rounded-full bg-primary" style={{ width: `${v}%` }} />
      </span>
    </span>
  );
}

const th = "py-2 font-semibold";
const td = "py-2 tabular-nums";

function UsageTable({ rows, mock, caption }: { rows: (UsageRow & { title: string; certCode: string; clusters: number })[]; mock: boolean; caption: string }) {
  return (
    <div className="relative mt-3 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm [&_td]:pr-3 [&_th]:pr-3">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className={th}>{mock ? "Mock exam" : "Lab"}</th>
            <th scope="col" className={th}>Starts</th>
            <th scope="col" className={th}>Learners</th>
            <th scope="col" className={th}>Completed</th>
            <th scope="col" className={th}>Failed to boot</th>
            <th scope="col" className={th}>{mock ? "Passed" : "Average score"}</th>
            <th scope="col" className={th}>Cluster minutes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.labId} className="border-t">
              <td className="py-2">
                <span className="font-medium">{r.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.certCode} · {r.clusters} {r.clusters === 1 ? "cluster" : "clusters"}
                </span>
              </td>
              <td className={td}>{num.format(r.starts)}</td>
              <td className={td}>{num.format(r.learners)}</td>
              <td className={td}>
                {num.format(r.completed)} <span className="text-muted-foreground">({pct(percent(r.completed, r.starts))})</span>
              </td>
              <td className={cn(td, r.failed > 0 && "text-destructive")}>{num.format(r.failed)}</td>
              <td className={td}>
                {mock ? (
                  <>
                    {num.format(r.passed)} <span className="text-muted-foreground">({pct(percent(r.passed, r.completed))})</span>
                  </>
                ) : (
                  pct(r.averageScore)
                )}
              </td>
              <td className={td}>{num.format(r.clusterMinutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  await requireAdmin();
  const weeks = parseRange((await searchParams).weeks);
  const today = todayIn("UTC");
  const a = await getAnalytics(today, weeks);
  const span = `the last ${weeks} weeks`;
  const lastWeek = a.weeklyActive[a.weeklyActive.length - 1];
  const peak = a.weeklyActive.reduce((m, p) => (p.value > m.value ? p : m), a.weeklyActive[0] ?? { week: today, value: 0 });
  const activeSummary =
    a.activeInWindow === 0
      ? `No learner activity in ${span}.`
      : `Learners active each week, ${span}: ${lastWeek?.value ?? 0} so far this week, peak ${peak.value} in the week of ${formatShort(peak.week)}.`;
  const clusterTotal = a.labTotals.clusterMinutes + a.mockTotals.clusterMinutes;
  const clusterSummary =
    clusterTotal === 0 ? `No lab or mock exam clusters ran in ${span}.` : `Cluster minutes per week, ${span}: ${num.format(clusterTotal)} in total across labs and mock exams.`;

  return (
    <>
      <PageHeader
        title="Analytics"
        eyebrow={<Link href="/admin">Admin</Link>}
        lead={`Learner activity, weak spots and lab use since ${formatShort(a.from)}. Admin accounts are left out. Weeks start on Monday (UTC).`}
        actions={
          <nav aria-label="Time range" className="flex gap-1 rounded-md border p-1">
            {RANGE_WEEKS.map((w) => (
              <Link
                key={w}
                href={`/admin/analytics?weeks=${w}`}
                aria-current={w === weeks ? "page" : undefined}
                className={cn(
                  "rounded px-3 py-1.5 text-sm font-medium no-underline",
                  w === weeks ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {w} weeks
              </Link>
            ))}
          </nav>
        }
      />
      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat
            label="Active, last 7 days"
            value={num.format(a.active7)}
            note={a.active7Change === null ? "No activity the week before" : `${a.active7Change >= 0 ? "+" : ""}${a.active7Change}% on the 7 days before`}
          />
          <Stat label="Active, last 30 days" value={num.format(a.active30)} note={`of ${num.format(a.learners)} learners`} />
          <Stat label="New sign-ups" value={num.format(a.signUps)} note={`in ${span}`} />
          <Stat label="Questions answered" value={num.format(a.answers)} note={`in ${span}`} />
          <Stat
            label="Lab and mock starts"
            value={num.format(a.labTotals.starts + a.mockTotals.starts)}
            note={`${num.format(a.labTotals.starts)} labs, ${num.format(a.mockTotals.starts)} mock exams`}
          />
          <Stat label="Cluster minutes" value={num.format(clusterTotal)} note="Minutes × clusters, the future cloud bill" />
        </dl>

        <Card aria-labelledby="active">
          <CardTitle id="active">Active learners per week</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">A learner is active in a week when they answer a question, finish a lesson, or start a lab or mock exam.</p>
          <div className="mt-3">
            <WeeklyBars points={a.weeklyActive} unit="learners" label="Active learners" summary={activeSummary} />
          </div>
        </Card>

        <Card aria-labelledby="domains">
          <CardTitle id="domains">Weakest domains</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Share of answers and graded lab or mock tasks that were right, per cert domain, weakest first. Domains with fewer than {MIN_DOMAIN_EVIDENCE} are left out.
          </p>
          {a.domains.length === 0 ? (
            <p className="mt-3 text-[15px] text-muted-foreground">Not enough answers in {span} to compare domains yet.</p>
          ) : (
            <div className="relative mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm [&_td]:pr-3 [&_th]:pr-3">
                <thead className="text-muted-foreground">
                  <tr>
                    <th scope="col" className={th}>Cert</th>
                    <th scope="col" className={th}>Domain</th>
                    <th scope="col" className={th}>Right</th>
                    <th scope="col" className={th}>Answers</th>
                    <th scope="col" className={th}>Lab tasks</th>
                    <th scope="col" className={th}>Learners</th>
                  </tr>
                </thead>
                <tbody>
                  {a.domains.slice(0, 10).map((d) => (
                    <tr key={`${d.certCode}/${d.domainKey}`} className="border-t">
                      <td className="py-2">
                        <Link href={`/certs/${d.certCode.toLowerCase()}`}>{d.certCode}</Link>
                      </td>
                      <td className="py-2">
                        <Link href={`/certs/${d.certCode.toLowerCase()}/domains/${d.domainKey}`}>{d.domainName}</Link>
                      </td>
                      <td className="py-2">
                        <Accuracy value={d.accuracy} />
                      </td>
                      <td className={td}>{num.format(d.answers)}</td>
                      <td className={td}>{num.format(d.tasks)}</td>
                      <td className={td}>{num.format(d.learners)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card aria-labelledby="questions">
          <CardTitle id="questions">Most missed questions</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Questions answered at least {MIN_QUESTION_ANSWERS} times, lowest share right first. A very low share can also mean the question is unclear or its marked answer is wrong.
          </p>
          {a.weakQuestions.length === 0 ? (
            <p className="mt-3 text-[15px] text-muted-foreground">No question has enough answers in {span} yet.</p>
          ) : (
            <div className="relative mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm [&_td]:pr-3 [&_th]:pr-3">
                <thead className="text-muted-foreground">
                  <tr>
                    <th scope="col" className={th}>Question</th>
                    <th scope="col" className={th}>Right</th>
                    <th scope="col" className={th}>Answers</th>
                    <th scope="col" className={th}>Learners</th>
                  </tr>
                </thead>
                <tbody>
                  {a.weakQuestions.map((q) => (
                    <tr key={q.questionId} className="border-t align-top">
                      <td className="max-w-[420px] py-2">
                        <Link href={`/admin/content/question/${encodeURIComponent(q.questionId)}`} className="line-clamp-2">
                          {q.stem}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {q.certCode}
                          {q.domainName ? ` · ${q.domainName}` : ""}
                        </span>
                      </td>
                      <td className="py-2">
                        <Accuracy value={q.accuracy} />
                      </td>
                      <td className={td}>{num.format(q.answers)}</td>
                      <td className={td}>{num.format(q.learners)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card aria-labelledby="clusters">
          <CardTitle id="clusters">Cluster minutes per week</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Minutes each session&apos;s clusters were up, times the number of clusters, by the week they booted. Mock exams count from the prepare screen, when their clusters are already
            running. Local Docker costs nothing; on cloud VMs this is what the monthly credits pay for.
          </p>
          <div className="mt-3">
            <WeeklyBars points={a.weeklyClusterMinutes} unit="cluster minutes" label="Cluster minutes" summary={clusterSummary} />
          </div>
        </Card>

        <Card aria-labelledby="labs">
          <CardTitle id="labs">Labs</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {a.labTotals.starts === 0
              ? `No labs started in ${span}.`
              : `${num.format(a.labTotals.starts)} starts by ${num.format(a.labTotals.learners)} learners; ${pct(percent(a.labTotals.completed, a.labTotals.starts))} completed, average score ${pct(a.labTotals.averageScore)}. Completed means graded at the end, by the learner or at the time limit.`}
          </p>
          {a.labs.length > 0 ? <UsageTable rows={a.labs} mock={false} caption={`Lab usage in ${span}`} /> : null}
        </Card>

        <Card aria-labelledby="mocks">
          <CardTitle id="mocks">Mock exams</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {a.mockTotals.starts === 0
              ? `No mock exams started in ${span}.`
              : `${num.format(a.mockTotals.starts)} attempts by ${num.format(a.mockTotals.learners)} learners, exam and practice mode together; ${pct(percent(a.mockTotals.completed, a.mockTotals.starts))} completed, ${pct(percent(a.mockTotals.passed, a.mockTotals.completed))} of those passed.`}
          </p>
          {a.mocks.length > 0 ? <UsageTable rows={a.mocks} mock caption={`Mock exam usage in ${span}`} /> : null}
        </Card>
      </div>
    </>
  );
}
