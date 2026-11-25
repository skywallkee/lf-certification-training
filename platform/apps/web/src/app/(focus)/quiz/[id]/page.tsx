import { and, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as z from "zod";
import { question as questionTable } from "@lfct/curriculum/db";
import { FlagButton } from "@/components/item-tools";
import { Markdown } from "@/components/markdown";
import { QuestionCard } from "@/components/question-card";
import { SampleBadge } from "@/components/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getDb } from "@/db";
import { answer, quiz } from "@/db/schema";
import { en } from "@/messages/en";
import { getCatalog } from "@/server/catalog";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Quiz" };

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/quiz/${id}`);
  const db = getDb();
  const [q] = await db.select().from(quiz).where(and(eq(quiz.id, id), eq(quiz.userId, user.id)));
  if (!q) notFound();
  const [answers, questions, catalog] = await Promise.all([
    db.select().from(answer).where(eq(answer.quizId, id)),
    db.select().from(questionTable).where(inArray(questionTable.id, q.questionIds)),
    getCatalog(),
  ]);
  const byId = new Map(questions.map((x) => [x.id, x]));
  const ids = q.questionIds.filter((qid) => byId.has(qid));
  const answered = new Map(answers.map((a) => [a.questionId, a]));
  const currentIndex = ids.findIndex((qid) => !answered.has(qid));
  const title = q.kind === "review" ? "Review" : `${q.certCode} practice`;
  const domainLabel =
    q.kind === "practice" && q.certCode && q.domainKeys.length === 1
      ? catalog.certs.get(q.certCode)?.domains.find((d) => d.key === q.domainKeys[0])?.name
      : undefined;

  const header = (progress: number, label: string) => (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-4 py-4 sm:px-8">
      <div className="flex items-center gap-4">
        <span className="font-bold">{en.appName}</span>
        <Link href={q.kind === "review" ? "/review" : "/today"} className="text-sm font-medium">
          Exit quiz
        </Link>
      </div>
      <div className="flex max-w-md flex-[1_1_280px] flex-col items-center gap-1.5">
        <span className="flex flex-wrap items-center justify-center gap-2 text-[13px] text-muted-foreground">
          {title}
          {domainLabel ? ` · ${domainLabel}` : ""} · {label} <SampleBadge />
        </span>
        <Progress value={progress} label={label} className="h-1.5" />
      </div>
      <span className="text-[13px] text-muted-foreground">No timer · press ? for keys</span>
    </header>
  );

  if (currentIndex === -1) {
    const right = ids.filter((qid) => answered.get(qid)?.correct).length;
    const missed = ids.filter((qid) => !answered.get(qid)?.correct);
    // Per-domain results for the end screen.
    const domains = new Map<string, { name: string; right: number; total: number; cert: string; key: string }>();
    for (const qid of ids) {
      const item = byId.get(qid)!;
      const ref = item.competencyRefs[0]!;
      const entry = catalog.competencies.get(ref);
      const k = `${entry?.cert.code}/${entry?.domain.key}`;
      const d = domains.get(k) ?? { name: `${entry?.cert.code ?? ""} · ${entry?.domain.name ?? ref}`, right: 0, total: 0, cert: entry?.cert.code ?? "", key: entry?.domain.key ?? "" };
      d.total += 1;
      if (answered.get(qid)?.correct) d.right += 1;
      domains.set(k, d);
    }
    const weakest = [...domains.values()].sort((a, b) => a.right / a.total - b.right / b.total)[0];
    return (
      <>
        {header(100, "Finished")}
        <main id="main" className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-10 sm:px-6">
          <h1 className="text-[26px] font-bold">
            {right} of {ids.length} right
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {missed.length === 0
              ? "Every answer right. Readiness on Today has been updated."
              : `${missed.length} missed question${missed.length === 1 ? " joins" : "s join"} your review queue for tomorrow. Readiness on Today has been updated.`}
          </p>
          <ul className="flex flex-col gap-2 rounded-lg border bg-card p-5 text-sm">
            {[...domains.values()].map((d) => (
              <li key={d.name} className="flex justify-between gap-3">
                <span>{d.name}</span>
                <span className="text-muted-foreground">
                  {d.right} of {d.total}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            {missed.length > 0 ? (
              <Link href="/review" className={buttonVariants()}>
                Review missed questions
              </Link>
            ) : null}
            {weakest && q.kind === "practice" ? (
              <Link href={`/practice?cert=${weakest.cert}&domains=${weakest.key}`} className={buttonVariants({ variant: missed.length > 0 ? "outline" : "default" })}>
                Practise {weakest.name.split(" · ")[1]} again
              </Link>
            ) : null}
            <Link href="/today" className={buttonVariants({ variant: "outline" })}>
              Back to Today
            </Link>
          </div>
          <section aria-labelledby="answers" className="flex flex-col gap-4">
            <h2 id="answers" className="text-lg font-semibold">
              Your answers
            </h2>
            {ids.map((qid, i) => {
              const item = byId.get(qid)!;
              const a = answered.get(qid)!;
              const correctIds = item.options.filter((o) => o.correct).map((o) => o.id);
              return (
                <article key={qid} className="flex flex-col gap-2 rounded-lg border bg-card p-5">
                  <p className={`text-sm font-semibold ${a.correct ? "text-success" : "text-destructive"}`}>
                    Question {i + 1}: {a.correct ? "right" : "missed"}
                  </p>
                  <Markdown className="font-medium">{item.stem}</Markdown>
                  <ul className="flex flex-col gap-1 text-sm">
                    {item.options.map((o) => (
                      <li key={o.id} className={correctIds.includes(o.id) ? "font-semibold text-success" : a.selected.includes(o.id) ? "text-destructive" : "text-muted-foreground"}>
                        {correctIds.includes(o.id) ? "Correct: " : a.selected.includes(o.id) ? "Your answer: " : ""}
                        {o.text}
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm">{item.explanation}</p>
                  <p className="text-sm text-muted-foreground">
                    Source:{" "}
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                      {item.sourceTitle}
                    </a>
                  </p>
                </article>
              );
            })}
          </section>
        </main>
      </>
    );
  }

  const current = byId.get(ids[currentIndex]!)!;
  const label = `Question ${currentIndex + 1} of ${ids.length}`;
  return (
    <>
      {header((currentIndex / ids.length) * 100, label)}
      <main id="main" className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6">
        <h1 className="sr-only">{label}</h1>
        <QuestionCard
          key={current.id}
          quizId={q.id}
          questionId={current.id}
          kind={current.kind}
          stem={<Markdown>{current.stem}</Markdown>}
          options={current.options.map((o) => ({ id: o.id, content: <Markdown>{o.text}</Markdown> }))}
          isLast={currentIndex === ids.length - 1}
          flag={<FlagButton targetType="question" targetId={current.id} label={en.quiz.flag} />}
        />
      </main>
    </>
  );
}
