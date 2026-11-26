import type { Metadata } from "next";
import Link from "next/link";
import { startReviewAction } from "@/app/actions/study";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatShort, formatWeekday, daysBetween } from "@/lib/dates";
import { HARD_AFTER_LAPSES, INTERVAL_DAYS, isHard, reviewMinutes, stepLabel } from "@/lib/review";
import { en } from "@/messages/en";
import { competencyPath, getCatalog, lessonsFor } from "@/server/catalog";
import { getReviewCleared, getReviewQueue, getReviewUpcoming } from "@/server/progress";
import { requireOnboarded } from "@/server/session";
import { learnerToday } from "@/server/today";

export const metadata: Metadata = { title: "Review" };

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function dueText(dueOn: string, today: string): string {
  const days = daysBetween(today, dueOn);
  if (days < 0) return `Overdue since ${formatShort(dueOn)}`;
  if (days === 0) return "Due today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return formatWeekday(dueOn);
  return formatShort(dueOn);
}

function stemPreview(stem: string): string {
  const plain = stem.replace(/[`*_>#]/g, "").replace(/\s+/g, " ").trim();
  return plain.length > 140 ? `${plain.slice(0, 137)}…` : plain;
}

export default async function ReviewPage() {
  const { user, profile } = await requireOnboarded("/review");
  const today = learnerToday(profile);
  const [queue, upcoming, cleared, catalog] = await Promise.all([
    getReviewQueue(user.id),
    getReviewUpcoming(user.id, today),
    getReviewCleared(user.id),
    getCatalog(),
  ]);
  const due = queue.filter((q) => q.dueOn <= today);
  const dueByCert = [...due.reduce((m, q) => m.set(q.certCode, (m.get(q.certCode) ?? 0) + 1), new Map<string, number>())].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const hard = queue.filter((q) => isHard(q)).length;

  return (
    <>
      <PageHeader
        title="Review"
        lead="Missed questions come back on a schedule, a little further apart each time you get them right, until they stick."
      />
      <div className="grid gap-6 md:grid-cols-2">
        <Card aria-labelledby="due">
          <CardTitle id="due">Due today</CardTitle>
          {due.length === 0 ? (
            <p className="mt-2 text-[15px] text-muted-foreground">{en.review.empty}</p>
          ) : (
            <>
              <p className="mt-2 text-[15px] text-muted-foreground">
                {plural(due.length, "question")}, about {plural(reviewMinutes(due.length), "minute")}
                {due.length > 20 ? ". Sessions take 20 at a time, most overdue first." : "."}
              </p>
              <form action={startReviewAction} className="mt-4">
                <Button type="submit">{dueByCert.length > 1 ? "Review all certs" : "Start review"}</Button>
              </form>
              {dueByCert.length > 1 ? (
                <div className="mt-4">
                  <p className="text-[13px] text-muted-foreground">Or one cert at a time:</p>
                  <ul className="mt-2 flex flex-wrap gap-2" aria-label="Review one cert">
                    {dueByCert.map(([code, n]) => (
                      <li key={code}>
                        <form action={startReviewAction}>
                          <input type="hidden" name="cert" value={code} />
                          <Button type="submit" variant="outline" size="sm" aria-label={`Review ${code}, ${plural(n, "question")} due`}>
                            {code} · {n}
                          </Button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </Card>
        <Card aria-labelledby="upcoming">
          <CardTitle id="upcoming">Next 7 days</CardTitle>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-[15px] text-muted-foreground">Nothing scheduled this week.</p>
          ) : (
            <ul className="mt-2 divide-y text-sm">
              {upcoming.map((u) => (
                <li key={u.dueOn} className="flex justify-between py-2">
                  <span>{formatWeekday(u.dueOn)}</span>
                  <span className="text-muted-foreground">{plural(u.count, "question")}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[13px] text-muted-foreground">
            Intervals after each right answer: {INTERVAL_DAYS.join(", ")} days, then the question leaves the queue. A wrong answer
            starts it again from 1 day.
          </p>
        </Card>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-4 rounded-lg border bg-card p-4 text-center">
        <div>
          <dt className="text-[13px] text-muted-foreground">In the queue</dt>
          <dd className="text-[22px] font-bold">{queue.length}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted-foreground">Hard</dt>
          <dd className="text-[22px] font-bold">{hard}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted-foreground">Learned</dt>
          <dd className="text-[22px] font-bold">{cleared}</dd>
        </div>
      </dl>

      <Card aria-labelledby="queue" className="mt-6">
        <CardTitle id="queue">Your queue</CardTitle>
        {queue.length === 0 ? (
          <p className="mt-2 text-[15px] text-muted-foreground">
            {cleared > 0
              ? `Empty. You have learned all ${plural(cleared, "question")} you once missed.`
              : "Empty. Questions you miss in a quiz show up here."}
          </p>
        ) : (
          <>
            <p className="mt-1 text-[13px] text-muted-foreground">
              A question missed {HARD_AFTER_LAPSES} times or more is marked hard: reading its lesson again usually helps more than
              another try.
            </p>
            <ul className="mt-3 divide-y">
              {queue.map((q) => {
                const ref = q.competencyRefs.find((r) => r.startsWith(`${q.certCode.toLowerCase()}/`)) ?? q.competencyRefs[0];
                const lesson = ref ? lessonsFor(catalog, ref)[0] : undefined;
                return (
                  <li key={q.questionId} className="grid gap-2 py-3 sm:grid-cols-[1fr_10rem] sm:items-center sm:gap-6">
                    <div className="min-w-0">
                      <p className="text-[15px]">{stemPreview(q.stem)}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                        <span className="font-semibold text-foreground">{q.certCode}</span>
                        <span aria-hidden="true">·</span>
                        <span>{dueText(q.dueOn, today)}</span>
                        <span aria-hidden="true">·</span>
                        <span>missed {q.lapses === 1 ? "once" : `${q.lapses} times`}</span>
                        {isHard(q) ? (
                          <>
                            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">Hard</span>
                            {ref ? (
                              <Link href={competencyPath(ref)}>{lesson ? `Read “${lesson.title}”` : "Open the topic"}</Link>
                            ) : null}
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
                      <span>{stepLabel(q.box)}</span>
                      <Progress value={((q.box + 1) / INTERVAL_DAYS.length) * 100} label={`${stepLabel(q.box)} for this question`} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
