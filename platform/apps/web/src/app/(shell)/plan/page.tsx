import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarClock, ClipboardCheck, FlaskConical, Flag, Moon, RotateCcw, Timer } from "lucide-react";
import { ExamDateForm, SendPlanNow } from "@/components/forms/plan-forms";
import { PageHeader } from "@/components/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { addDays, formatLong, formatShort } from "@/lib/dates";
import { WEEKDAYS } from "@/lib/reminders";
import { formatMinutes, type Pace, type PlanTask, type PlanWeek } from "@/lib/study-plan";
import { cn } from "@/lib/utils";
import { getCatalog } from "@/server/catalog";
import { getPlans, getStudyActivity, type CertPlan } from "@/server/plan";
import { requireOnboarded } from "@/server/session";
import { learnerToday } from "@/server/today";

export const metadata: Metadata = { title: "Study plan" };

const PACE: Record<Pace, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-success-soft text-success" },
  "on-track": { label: "On track", className: "bg-success-soft text-success" },
  tight: { label: "Tight", className: "bg-warning-soft text-warning" },
  behind: { label: "Behind", className: "bg-destructive-soft text-destructive" },
};

const TASK_ICON: Record<PlanTask["kind"], typeof BookOpen> = {
  study: BookOpen,
  quiz: ClipboardCheck,
  lab: FlaskConical,
  review: RotateCcw,
  mock: Timer,
  rest: Moon,
  exam: Flag,
};

const PHASE: Record<PlanWeek["phase"], string> = { learn: "Learn and practise", prepare: "Mock exam and weak spots", exam: "Exam week" };

function TaskList({ tasks }: { tasks: PlanTask[] }) {
  return (
    <ul className="flex flex-col divide-y">
      {tasks
        .filter((t) => t.kind !== "exam")
        .map((t) => {
          const Icon = TASK_ICON[t.kind];
          return (
            <li key={`${t.kind}-${t.label}`} className="flex items-start gap-3 py-2.5 text-[15px]">
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">{t.href ? <Link href={t.href}>{t.label}</Link> : t.label}</span>
              {t.minutes > 0 ? <span className="shrink-0 text-sm text-muted-foreground">{formatMinutes(t.minutes)}</span> : null}
            </li>
          );
        })}
    </ul>
  );
}

function PlanCard({ p, today, max }: { p: CertPlan; today: string; max: string }) {
  const code = p.cert.code;
  const id = `plan-${code.toLowerCase()}`;
  if (!p.plan || !p.date) {
    return (
      <Card aria-labelledby={id} className="flex flex-col gap-4">
        <div>
          <CardTitle id={id} className="text-lg">
            {code} <span className="ml-1 text-sm font-normal text-muted-foreground">{p.cert.name}</span>
          </CardTitle>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {p.focus ? "Your focus cert has no exam date yet. " : ""}Pick a date, booked or just a target, and you get a week-by-week plan to it.
          </p>
        </div>
        <ExamDateForm cert={code} date={null} booked={false} today={today} max={max} />
      </Card>
    );
  }
  const plan = p.plan;
  const [thisWeek, ...later] = plan.weeks;
  const pace = PACE[plan.pace];
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle id={id} className="text-lg">
            <Link href={`/certs/${code.toLowerCase()}`} className="text-foreground">
              {code}
            </Link>{" "}
            <span className="ml-1 text-sm font-normal text-muted-foreground">{p.cert.name}</span>
          </CardTitle>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
            <CalendarClock aria-hidden="true" className="size-4" />
            <span>
              Exam on {formatLong(p.date.examOn)} ({p.date.booked ? "booked" : "target date"})
            </span>
            <span>
              · {plan.daysLeft === 0 ? "today" : `${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"} left`}
            </span>
          </p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", pace.className)}>{pace.label}</span>
      </div>
      <p className="text-[15px]">{plan.paceNote}</p>

      {thisWeek ? (
        <section aria-labelledby={`${id}-week`}>
          <h3 id={`${id}-week`} className="text-sm font-semibold">
            This week{thisWeek.minutes > 0 ? `, about ${formatMinutes(thisWeek.minutes)}` : ""}
            <span className="ml-2 font-normal text-muted-foreground">{PHASE[thisWeek.phase]}</span>
          </h3>
          <TaskList tasks={thisWeek.tasks} />
        </section>
      ) : null}

      {later.length > 0 ? (
        <details className="group" open={later.length <= 4}>
          <summary className="cursor-pointer text-sm font-semibold">
            Weeks ahead ({later.length})
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <caption className="sr-only">{code} plan, week by week</caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">Week of</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Focus</th>
                  <th scope="col" className="py-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {later.map((w) => (
                  <tr key={w.start}>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatShort(w.start).replace(/ \d{4}$/, "")}</td>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{PHASE[w.phase]}</span>
                      {w.focus.length > 0 ? <span className="text-muted-foreground">: {w.focus.join(" and ")}</span> : null}
                      {w.tasks.some((t) => t.kind === "mock") ? <span className="text-muted-foreground"> · timed mock exam</span> : null}
                      {w.tasks.some((t) => t.kind === "lab") ? <span className="text-muted-foreground"> · a lab</span> : null}
                      {w.phase === "exam" ? <span className="text-muted-foreground"> · exam {formatShort(w.end).replace(/ \d{4}$/, "")}</span> : null}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap text-muted-foreground">{w.minutes > 0 ? formatMinutes(w.minutes) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <details className="border-t pt-4">
        <summary className="cursor-pointer text-sm font-semibold">Change the exam date</summary>
        <div className="mt-3">
          <ExamDateForm cert={code} date={p.date.examOn} booked={p.date.booked} today={today} max={max} />
        </div>
      </details>
    </Card>
  );
}

export default async function PlanPage() {
  const { user, profile } = await requireOnboarded("/plan");
  const today = learnerToday(profile);
  const catalog = await getCatalog();
  const [plans, activity] = await Promise.all([
    getPlans(user.id, catalog, { today, hoursPerWeek: profile.hoursPerWeek, focusCert: profile.focusCert }),
    getStudyActivity(user.id, catalog, profile.timeZone, today),
  ]);
  const hours = profile.hoursPerWeek ?? 4;
  const max = addDays(today, 730);
  const dated = plans.filter((p) => p.plan);
  const planned = dated[0]?.plan?.weeks[0]?.minutes ?? 0;
  const reminders = [profile.remindWeekly && `weekly plan on ${WEEKDAYS[profile.remindDay]}s`, profile.remindNudge && "nudges", profile.remindExam && "exam countdown"].filter(Boolean);
  const others = [...catalog.certs.values()].filter((c) => !plans.some((p) => p.cert.code === c.code));

  return (
    <>
      <PageHeader
        title="Study plan"
        lead={
          <>
            Week by week to your exam date, built from your readiness and your {hours} study hour{hours === 1 ? "" : "s"} a week (
            <Link href="/account">change</Link>).
          </>
        }
        actions={dated.length > 0 ? <SendPlanNow /> : undefined}
      />

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <dt className="text-[13px] text-muted-foreground">Studied this week</dt>
          <dd className="text-[22px] font-bold">
            {formatMinutes(activity.thisWeekMinutes)}
            {planned > 0 ? <span className="text-sm font-normal text-muted-foreground"> of about {formatMinutes(planned)}</span> : null}
          </dd>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <dt className="text-[13px] text-muted-foreground">Last week</dt>
          <dd className="text-[22px] font-bold">{formatMinutes(activity.lastWeekMinutes)}</dd>
        </div>
        <div className="col-span-2 rounded-lg border bg-card px-4 py-3 sm:col-span-1">
          <dt className="text-[13px] text-muted-foreground">
            <Link href="/account#reminders">Email reminders</Link>
          </dt>
          <dd className="text-[15px] font-semibold">{reminders.length > 0 ? `On: ${reminders.join(", ")}` : "Off"}</dd>
        </div>
      </dl>
      <p className="-mt-3 mb-6 text-sm text-muted-foreground">
        Study time is estimated from what you do here: about 1.5 minutes a question, each lesson&apos;s length, and the time spent in labs and mock exams.
      </p>

      <div className="flex flex-col gap-6">
        {plans.length === 0 ? (
          <Card>
            <p className="text-[15px] text-muted-foreground">
              No cert in progress. Choose a focus cert on your <Link href="/path">path</Link>, or add an exam date below.
            </p>
          </Card>
        ) : (
          plans.map((p) => <PlanCard key={p.cert.code} p={p} today={today} max={max} />)
        )}

        {others.length > 0 ? (
          <details className="rounded-lg border bg-card p-6">
            <summary className="cursor-pointer text-base font-semibold">Plan another cert</summary>
            <p className="mt-2 text-[15px] text-muted-foreground">Add an exam date to any cert to get a plan for it too.</p>
            <div className="mt-4">
              <ExamDateForm cert={others[0]!.code} date={null} booked={false} today={today} max={max} choices={others.map((c) => ({ code: c.code, name: c.name }))} />
            </div>
          </details>
        ) : null}
      </div>
    </>
  );
}
