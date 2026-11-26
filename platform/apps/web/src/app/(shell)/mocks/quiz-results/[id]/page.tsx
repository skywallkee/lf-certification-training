import { and, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import * as z from "zod";
import { CheckCircle2, XCircle } from "lucide-react";
import { question as questionTable } from "@lfct/curriculum/db";
import { LocalTime } from "@/components/local-time";
import { Markdown } from "@/components/markdown";
import { SampleBadge } from "@/components/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { quiz } from "@/db/schema";
import { cn } from "@/lib/utils";
import { getCatalog } from "@/server/catalog";
import { getQuizMock, getQuizMockHistory, gradeAttempt, GRACE_MS, resultOf } from "@/server/quiz-mocks";
import { requireUser } from "@/server/session";
import { startQuizMockAction } from "@/app/actions/quiz-mocks";

export const metadata: Metadata = { title: "Mock exam results" };

export default async function QuizMockResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/mocks/quiz-results/${id}`);
  const db = getDb();
  let [attempt] = await db.select().from(quiz).where(and(eq(quiz.id, id), eq(quiz.userId, user.id), eq(quiz.kind, "mock")));
  if (!attempt) notFound();
  if (!attempt.finishedAt) {
    if (attempt.expiresAt && attempt.expiresAt.getTime() + GRACE_MS > Date.now()) redirect(`/mocks/quiz/${id}`);
    await gradeAttempt(attempt);
    [attempt] = await db.select().from(quiz).where(eq(quiz.id, id));
    if (!attempt) notFound();
  }
  const [mock, rows, catalog, history] = await Promise.all([
    getQuizMock(attempt.mockId ?? ""),
    db.select().from(questionTable).where(inArray(questionTable.id, attempt.questionIds)),
    getCatalog(),
    getQuizMockHistory(user.id),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cert = catalog.certs.get(attempt.certCode ?? "");
  const result = resultOf(attempt, byId, cert);
  const series = history.find((h) => h.mock.id === attempt.mockId)?.graded ?? [];
  const index = series.findIndex((g) => g.id === id);
  const previous = index > 0 ? series[index - 1] : undefined;
  const answers = attempt.draft?.answers ?? {};
  const weakest = [...result.domains].sort((a, b) => a.percent - b.percent)[0];
  const used = attempt.finishedAt && attempt.expiresAt ? Math.min(attempt.finishedAt.getTime(), attempt.expiresAt.getTime()) - attempt.createdAt.getTime() : null;
  const allowed = attempt.expiresAt ? attempt.expiresAt.getTime() - attempt.createdAt.getTime() : null;

  return (
    <article className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
        <Link href="/mocks">Mock exams</Link> / <span aria-current="page">Results</span>
      </nav>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[30px] font-bold">{mock?.title ?? "Mock exam"}</h1>
          {mock?.mock ? <SampleBadge /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Multiple choice · started <LocalTime value={attempt.createdAt} />
          {used !== null && allowed !== null ? ` · time used ${Math.max(1, Math.round(used / 60_000))} of ${Math.round(allowed / 60_000)} min` : ""}
        </p>
      </header>

      <Card aria-labelledby="score" className={result.passed ? "border-success" : "border-destructive"}>
        <CardTitle id="score">Score</CardTitle>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-4xl font-bold">{result.score}%</span>
          <span className={cn("inline-flex items-center gap-1.5 text-lg font-semibold", result.passed ? "text-success" : "text-destructive")}>
            {result.passed ? <CheckCircle2 aria-hidden="true" className="size-5" /> : <XCircle aria-hidden="true" className="size-5" />}
            {result.passed ? "Pass" : "Not a pass yet"}
          </span>
          <span className="text-muted-foreground">
            Pass mark {result.passMark}% · {result.right} of {result.total} right · {result.total - Object.keys(answers).length} not answered
          </span>
        </div>
        {previous ? (
          <p className="mt-2 text-sm">
            {result.score === previous.score
              ? "The same score as your previous attempt"
              : `${result.score > previous.score ? "Up" : "Down"} ${Math.abs(result.score - previous.score)} points from your previous attempt (${previous.score}%)`}
            . <Link href="/mocks/history">See your score trend</Link>
          </p>
        ) : null}
        <p className="mt-2 text-sm text-muted-foreground">Missed questions join your review queue, and readiness on Today counts your answers.</p>
      </Card>

      {result.domains.length > 0 ? (
        <Card aria-labelledby="domains">
          <CardTitle id="domains">Score per domain</CardTitle>
          <ul className="mt-3 flex flex-col gap-3">
            {result.domains.map((d) => (
              <li key={d.domain} className="flex flex-col gap-1">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-semibold">{d.name}</span>
                  <span className="text-muted-foreground">
                    {d.right} of {d.total} right · {d.percent}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                  <div className={cn("h-full rounded-full", d.percent >= result.passMark ? "bg-success" : "bg-warning")} style={{ width: `${d.percent}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {weakest && weakest.percent < 100 && weakest.domain !== "other" ? (
            <p className="mt-4 text-sm">
              Weakest: <strong>{weakest.name}</strong>. <Link href={`/certs/${(attempt.certCode ?? "").toLowerCase()}/domains/${weakest.domain}`}>Study this domain</Link> or{" "}
              <Link href={`/practice?cert=${attempt.certCode}&domains=${weakest.domain}`}>practise its questions</Link>.
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card aria-labelledby="answers">
        <CardTitle id="answers">Your answers</CardTitle>
        <ol className="mt-3 flex flex-col gap-5">
          {attempt.questionIds.map((qid, i) => {
            const item = byId.get(qid);
            if (!item) return null;
            const mine = answers[qid] ?? [];
            const correctIds = item.options.filter((o) => o.correct).map((o) => o.id);
            const right = mine.length > 0 && mine.length === correctIds.length && mine.every((x) => correctIds.includes(x));
            return (
              <li key={qid} className="flex flex-col gap-2 border-t pt-4 first:border-t-0 first:pt-0">
                <p className={cn("text-sm font-semibold", right ? "text-success" : "text-destructive")}>
                  Question {i + 1}: {right ? "right" : mine.length === 0 ? "not answered" : "missed"}
                </p>
                <Markdown className="font-medium">{item.stem}</Markdown>
                <ul className="flex flex-col gap-1 text-sm">
                  {item.options.map((o) => (
                    <li key={o.id} className={correctIds.includes(o.id) ? "font-semibold text-success" : mine.includes(o.id) ? "text-destructive" : "text-muted-foreground"}>
                      {correctIds.includes(o.id) ? "Correct: " : mine.includes(o.id) ? "Your answer: " : ""}
                      {o.text}
                    </li>
                  ))}
                </ul>
                <Markdown className="text-sm">{item.explanation}</Markdown>
                <p className="text-sm text-muted-foreground">
                  Source:{" "}
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                    {item.sourceTitle}
                  </a>
                </p>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="flex flex-wrap gap-3">
        {mock?.published ? (
          <form action={startQuizMockAction}>
            <input type="hidden" name="mock" value={mock.id} />
            <button type="submit" className={buttonVariants({ variant: "outline" })}>
              Take it again
            </button>
          </form>
        ) : null}
        <Link href="/review" className={buttonVariants({ variant: "outline" })}>
          Review missed questions
        </Link>
        <Link href="/mocks" className={buttonVariants({ variant: "ghost" })}>
          All mock exams
        </Link>
      </div>
    </article>
  );
}
