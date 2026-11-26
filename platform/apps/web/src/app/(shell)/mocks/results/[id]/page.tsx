import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { notFound, redirect } from "next/navigation";
import * as z from "zod";
import { CheckCircle2, ExternalLink, EyeOff, XCircle } from "lucide-react";
import { domainScores, isActive, taskScores } from "@lfct/labs";
import { DiscussLink } from "@/components/discussions/discuss-link";
import { SessionStatus, durationLabel } from "@/components/labs/session-status";
import { Markdown } from "@/components/markdown";
import { SampleBadge } from "@/components/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getCatalog } from "@/server/catalog";
import { getLab, getLastCheck, getSession } from "@/server/labs";
import { domainName, getMockHistory } from "@/server/mocks";
import { discussionCounts } from "@/server/discussions";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Mock exam results" };

export default async function MockResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/mocks/results/${id}`);
  const session = await getSession(id, user.id);
  if (!session) notFound();
  if (session.mode === "lab") redirect(`/labs/history/${id}`);
  if (isActive(session.status)) redirect(`/mocks/attempts/${id}`);
  const [lab, final, catalog, history] = await Promise.all([getLab(session.labId), getLastCheck(id, "final"), getCatalog(), getMockHistory(user.id)]);
  // The graded attempt of the same mock just before this one, for "compared with last time".
  const series = history.find((h) => h.mock.id === session.labId)?.graded ?? [];
  const index = series.findIndex((g) => g.id === id);
  const previous = index > 0 ? series[index - 1] : undefined;
  const results = final?.results ?? [];
  const cert = catalog.certs.get(session.certCode);
  const passMark = lab?.passPercent ?? 66;
  const graded = session.score !== null && lab !== null;
  const passed = graded && session.score! >= passMark;
  const perTask = lab ? new Map(taskScores(lab.tasks, results).map((t) => [t.taskId, t])) : new Map();
  const domains = lab ? domainScores(lab.tasks, results) : [];
  const weakest = domains[0];
  const mode = session.mode === "exam" ? "Exam mode" : "Practice mode";
  const talk = lab ? await discussionCounts("mock-task", lab.tasks.map((t) => `${lab.id}/${t.id}`)) : new Map<string, number>();

  return (
    <article className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
        <Link href="/mocks">Mock exams</Link> / <span aria-current="page">Results</span>
      </nav>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[30px] font-bold">{lab?.title ?? session.labId}</h1>
          {lab?.mock ? <SampleBadge /> : null}
          <SessionStatus status={session.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {mode} · started <LocalTime value={session.startedAt ?? session.createdAt} /> · time used {durationLabel(session.startedAt, session.endedAt)} of{" "}
          {session.minutes} min
        </p>
        {session.statusMessage ? <p className="text-[15px]">{session.statusMessage}</p> : null}
      </header>

      <Card aria-labelledby="score" className={cn(graded && (passed ? "border-success" : "border-destructive"))}>
        <CardTitle id="score">Score</CardTitle>
        {!graded ? (
          <p className="mt-2 text-[15px] text-muted-foreground">
            {session.startedAt === null
              ? "This attempt was not started, so nothing was graded and it does not count against your attempts."
              : "This attempt was not graded."}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-4xl font-bold">{session.score}%</span>
            <span className={cn("inline-flex items-center gap-1.5 text-lg font-semibold", passed ? "text-success" : "text-destructive")}>
              {passed ? <CheckCircle2 aria-hidden="true" className="size-5" /> : <XCircle aria-hidden="true" className="size-5" />}
              {passed ? "Pass" : "Not a pass yet"}
            </span>
            <span className="text-muted-foreground">
              Pass mark {passMark}% · {results.filter((r) => r.passed).length} of {results.length} checks passed
            </span>
          </div>
        )}
        {graded && previous ? (
          <p className="mt-2 text-sm">
            {session.score! === previous.score
              ? "The same score as your previous attempt"
              : `${session.score! > previous.score ? "Up" : "Down"} ${Math.abs(session.score! - previous.score)} points from your previous attempt (${previous.score}%)`}
            .{" "}
            <Link href="/mocks/history">See your score trend</Link>
          </p>
        ) : null}
        {session.startedAt ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <EyeOff aria-hidden="true" className="size-4" />
            {session.windowLeaves === 0
              ? "You stayed in the exam window the whole time."
              : `You left the exam window ${session.windowLeaves} time${session.windowLeaves === 1 ? "" : "s"}.`}
          </p>
        ) : null}
      </Card>

      {graded && domains.length > 0 ? (
        <Card aria-labelledby="domains">
          <CardTitle id="domains">Score per domain</CardTitle>
          <ul className="mt-3 flex flex-col gap-3">
            {domains.map((d) => (
              <li key={d.domain} className="flex flex-col gap-1">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-semibold">{domainName(cert, d.domain)}</span>
                  <span className="text-muted-foreground">
                    {d.earned} of {d.possible} points · {d.percent}%
                    <DomainDelta now={d.percent} before={previous?.domains?.find((p) => p.domain === d.domain)?.percent} />
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                  <div className={cn("h-full rounded-full", d.percent >= passMark ? "bg-success" : "bg-warning")} style={{ width: `${d.percent}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {weakest && weakest.percent < 100 ? (
            <p className="mt-4 text-sm">
              Weakest: <strong>{domainName(cert, weakest.domain)}</strong>.{" "}
              <Link href={`/certs/${session.certCode.toLowerCase()}/domains/${weakest.domain}`}>Study this domain</Link> or{" "}
              <Link href="/labs">practise it in a lab</Link>.
            </p>
          ) : null}
        </Card>
      ) : null}

      {lab && graded ? (
        <Card aria-labelledby="tasks">
          <CardTitle id="tasks">Tasks</CardTitle>
          <ol className="mt-3 flex flex-col gap-5">
            {lab.tasks.map((t, i) => {
              const mine = results.filter((r) => r.taskId === t.id);
              const score = perTask.get(t.id);
              const full = score && score.passedChecks === score.totalChecks;
              return (
                <li key={t.id} className="border-t pt-4 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold">
                      {i + 1}. {t.title} <span className="font-normal text-muted-foreground">· cluster {t.cluster}</span>
                    </h3>
                    <span className={cn("text-sm font-semibold", full ? "text-success" : score?.earned ? "text-warning" : "text-destructive")}>
                      {score?.earned ?? 0} / {t.weight}
                    </span>
                  </div>
                  <Markdown className="mt-1 text-[15px] text-muted-foreground">{t.body}</Markdown>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {mine.map((r) => (
                      <li key={r.checkId} className="flex items-start gap-2 text-sm">
                        {r.passed ? (
                          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                        ) : (
                          <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
                        )}
                        <span>
                          <span className="sr-only">{r.passed ? "Passed: " : "Failed: "}</span>
                          {r.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {!full && t.doc ? (
                    <a href={t.doc.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm">
                      Read: {t.doc.title}
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                    </a>
                  ) : null}
                  <div className="mt-2">
                    <DiscussLink type="mock-task" id={`${lab.id}/${t.id}`} count={talk.get(`${lab.id}/${t.id}`) ?? 0} />
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      ) : null}

      {lab && session.startedAt ? (
        <Card aria-labelledby="solution">
          <CardTitle id="solution">Reference solution</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">One way to do it. Other answers that pass the checks are just as right.</p>
          <pre tabIndex={0} className="mt-3 overflow-x-auto rounded-md bg-terminal p-4 font-mono text-[13px] text-terminal-foreground">
            {lab.solution}
          </pre>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {lab ? (
          <Link href={`/mocks/${lab.id}`} className={buttonVariants({ variant: "outline" })}>
            Take it again
          </Link>
        ) : null}
        <Link href="/mocks" className={buttonVariants({ variant: "ghost" })}>
          All mock exams
        </Link>
      </div>
    </article>
  );
}

function DomainDelta({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined || before === now) return null;
  const up = now > before;
  return <span className={cn("ml-1 font-semibold", up ? "text-success" : "text-destructive")}>({up ? "up" : "down"} {Math.abs(now - before)} since last time)</span>;
}
