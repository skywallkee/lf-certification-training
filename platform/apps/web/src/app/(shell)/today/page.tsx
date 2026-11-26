import type { Metadata } from "next";
import Link from "next/link";
import { DomainWeightBar, weakestDomain } from "@/components/domain-weight-bar";
import { NextStepCard } from "@/components/next-step-card";
import { PageHeader } from "@/components/page-header";
import { ReadinessRing } from "@/components/readiness-ring";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { formatLong, formatShort, formatWeekday } from "@/lib/dates";
import { nextStep } from "@/lib/next-step";
import { reviewMinutes } from "@/lib/review";
import { en } from "@/messages/en";
import { getCatalog } from "@/server/catalog";
import {
  getCompletedLessons,
  getReadiness,
  getRecentActivity,
  getReviewDue,
  getStatusViews,
  getStreak,
  heldCerts,
} from "@/server/progress";
import { requireOnboarded } from "@/server/session";
import { learnerToday } from "@/server/today";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const { user, profile } = await requireOnboarded("/today");
  const today = learnerToday(profile);
  const catalog = await getCatalog();
  const focus = profile.focusCert ? catalog.certs.get(profile.focusCert) ?? null : null;
  const [views, due, streak, activity, completed, readiness] = await Promise.all([
    getStatusViews(user.id, catalog, today, profile.focusCert),
    getReviewDue(user.id, today),
    getStreak(user.id, profile.timeZone, today),
    getRecentActivity(user.id, catalog),
    getCompletedLessons(user.id),
    focus ? getReadiness(user.id, focus, today) : Promise.resolve(null),
  ]);
  const held = heldCerts(views);
  const booked = [...views.values()].filter((v) => v.status === "booked").length;
  const total = catalog.certs.size;
  const step = nextStep({
    cert: focus?.code ?? null,
    domains: readiness?.domains ?? [],
    competencies: focus ? focus.domains.flatMap((d) => d.competencies.map((c) => ({ ref: c.ref, statement: c.statement, domainKey: d.key }))) : [],
    lessons: catalog.lessons,
    completedLessons: completed,
    questionsByCompetency: catalog.questionsByCompetency,
  });
  const expiring = [...views].filter(([, v]) => v.status === "expiring").sort((a, b) => (a[1].daysLeft ?? 0) - (b[1].daysLeft ?? 0));
  const ckne = catalog.certs.get("CKNE");
  const weakest = readiness?.sufficient ? weakestDomain(readiness.domains) : undefined;

  return (
    <>
      <PageHeader
        eyebrow={formatWeekday(today)}
        title={`Today`}
        lead={streak > 0 ? `${streak}-day study streak. Keep it going.` : "Study a little today to start a streak."}
      />

      <div className="flex flex-col gap-6">
        {welcome ? (
          <Card aria-labelledby="welcome" className="border-primary">
            <div className="flex items-baseline justify-between gap-3">
              <CardTitle id="welcome">You are set up{focus ? `: first up is ${focus.code}` : ""}</CardTitle>
              <Link href="/today" className="text-sm">
                Hide
              </Link>
            </div>
            <ul className="mt-3 grid gap-3 text-[15px] sm:grid-cols-3">
              <li>
                <span className="font-semibold">Today</span>
                <span className="block text-sm text-muted-foreground">Your next step, your review queue and your streak. Start each session here.</span>
              </li>
              <li>
                <span className="font-semibold">Path</span>
                <span className="block text-sm text-muted-foreground">All {total} certs in a suggested order. Add exam dates there when you book.</span>
              </li>
              <li>
                <span className="font-semibold">Labs and mocks</span>
                <span className="block text-sm text-muted-foreground">Hands-on clusters in your browser, and timed practical exams when you are ready.</span>
              </li>
            </ul>
          </Card>
        ) : null}
        {held.size === total ? (
          <section aria-labelledby="golden" className="flex flex-col gap-3 rounded-lg border-2 border-success bg-card p-6">
            <p id="golden" className="text-xs font-semibold uppercase tracking-wider text-success">
              Golden Kubestronaut
            </p>
            <h2 className="text-[22px] font-semibold">You hold all {total} certs</h2>
            <p className="text-[15px] text-muted-foreground">
              {expiring[0]
                ? `${expiring[0][0]} expires on ${formatLong(expiring[0][1].expiresOn!)}. Renew it to stay Golden.`
                : "Everything is current. Review questions keep your knowledge fresh until the next renewal."}
            </p>
            <div>
              <Link href="/path" className={buttonVariants()}>
                See expiry dates
              </Link>
            </div>
          </section>
        ) : (
          <NextStepCard step={step} />
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {focus && readiness ? (
            <Card aria-labelledby="readiness">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <CardTitle id="readiness">{focus.code} readiness</CardTitle>
                <Link href={`/certs/${focus.code.toLowerCase()}/readiness`} className="text-sm">
                  Details
                </Link>
              </div>
              <ReadinessRing readiness={readiness} />
              {readiness.answers > 0 ? (
                <div className="mt-5 flex flex-col gap-3">
                  {readiness.domains.map((d) => (
                    <DomainWeightBar key={d.key} domain={d} weakest={d.key === weakest?.key} />
                  ))}
                </div>
              ) : null}
            </Card>
          ) : null}

          <div className="flex flex-col gap-6">
            <Card aria-labelledby="review-queue">
              <CardTitle id="review-queue">Review queue</CardTitle>
              <p className="mt-2 text-[15px] text-muted-foreground">
                {due.count === 0
                  ? en.review.empty
                  : `${due.count} question${due.count === 1 ? " is" : "s are"} due today, about ${reviewMinutes(due.count)} minute${reviewMinutes(due.count) === 1 ? "" : "s"}.`}
              </p>
              {due.count > 0 ? (
                <Link href="/review" className={`${buttonVariants({ variant: "outline" })} mt-3`}>
                  Review now
                </Link>
              ) : null}
            </Card>

            <Card aria-labelledby="path-summary">
              <div className="flex items-baseline justify-between gap-3">
                <CardTitle id="path-summary">Path to all {total}</CardTitle>
                <Link href="/path" className="text-sm">
                  Open path
                </Link>
              </div>
              <div className="mt-3 flex gap-1" role="img" aria-label={`${held.size} passed, ${booked} booked, ${total - held.size - booked} to go`}>
                <div className="h-2.5 rounded bg-success" style={{ flex: held.size || 0.0001 }} />
                <div className="h-2.5 rounded bg-primary" style={{ flex: booked || 0.0001 }} />
                <div className="h-2.5 rounded bg-muted" style={{ flex: total - held.size - booked || 0.0001 }} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {held.size} passed · {booked} booked · {total - held.size - booked} to go
              </p>
              {expiring.map(([code, v]) => (
                <p key={code} className="mt-1 text-sm font-medium text-warning">
                  {code} expires on {formatLong(v.expiresOn!)}.
                </p>
              ))}
              {ckne?.requiredFrom && ckne.requiredFrom > today ? (
                <p className="mt-1 text-sm font-medium text-warning">CKNE joins the bundle on {formatLong(ckne.requiredFrom)}.</p>
              ) : null}
            </Card>
          </div>
        </div>

        <Card aria-labelledby="activity">
          <CardTitle id="activity">Recent activity</CardTitle>
          {activity.length === 0 ? (
            <p className="mt-2 text-[15px] text-muted-foreground">Nothing yet. Finished lessons and quizzes show up here.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {activity.map((a) => (
                <li key={`${a.kind}-${a.href}-${a.at.getTime()}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <Link href={a.href}>{a.label}</Link>
                  <span className="text-muted-foreground">
                    {a.detail} · {formatShort(a.at.toISOString().slice(0, 10))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
