import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { notFound, redirect } from "next/navigation";
import * as z from "zod";
import { CheckCircle2, XCircle } from "lucide-react";
import { isActive } from "@lfct/labs";
import { SessionStatus, durationLabel } from "@/components/labs/session-status";
import { Markdown } from "@/components/markdown";
import { SampleBadge } from "@/components/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getHintUses, getLab, getLastCheck, getSession } from "@/server/labs";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Lab results" };

export default async function LabResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/labs/history/${id}`);
  const session = await getSession(id, user.id);
  if (!session) notFound();
  if (session.mode !== "lab") redirect(`/mocks/results/${id}`);
  const [lab, final, hintUses] = await Promise.all([getLab(session.labId), getLastCheck(id, "final"), getHintUses(id)]);
  const active = isActive(session.status);
  const results = final?.results ?? [];

  return (
    <article className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
        <Link href="/labs">Labs</Link> / <Link href="/labs/history">History</Link> / <span aria-current="page">Results</span>
      </nav>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[30px] font-bold">{lab?.title ?? session.labId}</h1>
          {lab?.mock ? <SampleBadge /> : null}
          <SessionStatus status={session.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Started <LocalTime value={session.createdAt} /> · time used {durationLabel(session.readyAt, session.endedAt)} · {hintUses.length} hint
          {hintUses.length === 1 ? "" : "s"} used
        </p>
        {session.statusMessage ? <p className="text-[15px]">{session.statusMessage}</p> : null}
      </header>

      {active ? (
        <Card>
          <p className="text-[15px]">This lab is still running.</p>
          <Link href={`/labs/sessions/${id}`} className={`${buttonVariants()} mt-3`}>
            Back to the lab
          </Link>
        </Card>
      ) : null}

      <Card aria-labelledby="score">
        <CardTitle id="score">Final score</CardTitle>
        {session.score === null ? (
          <p className="mt-2 text-[15px] text-muted-foreground">
            {session.status === "failed" ? "The lab did not start, so nothing was graded and no time was used." : "This lab was not graded."}
          </p>
        ) : (
          <p className="mt-2 text-[15px]">
            <span className="text-3xl font-bold">{session.score}%</span>{" "}
            <span className="text-muted-foreground">
              · {results.filter((r) => r.passed).length} of {results.length} checks passed
            </span>
          </p>
        )}
      </Card>

      {lab ? (
        <Card aria-labelledby="checks">
          <CardTitle id="checks">Tasks and checks</CardTitle>
          <ol className="mt-3 flex flex-col gap-5">
            {lab.tasks.map((t, i) => {
              const mine = results.filter((r) => r.taskId === t.id);
              const used = hintUses.filter((h) => h.taskId === t.id).length;
              return (
                <li key={t.id} className="border-t pt-4 first:border-t-0 first:pt-0">
                  <h3 className="font-semibold">
                    {i + 1}. {t.title} <span className="font-normal text-muted-foreground">· {t.weight}%{used ? ` · ${used} hint${used === 1 ? "" : "s"} used` : ""}</span>
                  </h3>
                  <Markdown className="mt-1 text-[15px] text-muted-foreground">{t.body}</Markdown>
                  {mine.length > 0 ? (
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
                            {r.passed ? r.message : `${t.checks.find((c) => c.id === r.checkId)?.description ?? r.checkId}. ${r.message}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Card>
      ) : null}

      {lab && !active ? (
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
          <Link href={`/labs/${lab.id}`} className={buttonVariants({ variant: "outline" })}>
            Run it again
          </Link>
        ) : null}
        <Link href="/labs" className={buttonVariants({ variant: "ghost" })}>
          All labs
        </Link>
      </div>
    </article>
  );
}
