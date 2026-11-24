import type { Metadata } from "next";
import { startReviewAction } from "@/app/actions/study";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { formatWeekday } from "@/lib/dates";
import { INTERVAL_DAYS, reviewMinutes } from "@/lib/review";
import { en } from "@/messages/en";
import { getReviewDue, getReviewUpcoming } from "@/server/progress";
import { requireOnboarded } from "@/server/session";
import { learnerToday } from "@/server/today";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage() {
  const { user, profile } = await requireOnboarded("/review");
  const today = learnerToday(profile);
  const [due, upcoming] = await Promise.all([getReviewDue(user.id, today), getReviewUpcoming(user.id, today)]);
  return (
    <>
      <PageHeader title="Review" lead="Missed questions come back on a schedule until you get them right several times in a row." />
      <div className="grid gap-6 md:grid-cols-2">
        <Card aria-labelledby="due">
          <CardTitle id="due">Due today</CardTitle>
          {due.count === 0 ? (
            <p className="mt-2 text-[15px] text-muted-foreground">{en.review.empty}</p>
          ) : (
            <>
              <p className="mt-2 text-[15px] text-muted-foreground">
                {due.count} question{due.count === 1 ? "" : "s"}, about {reviewMinutes(due.count)} minute{reviewMinutes(due.count) === 1 ? "" : "s"}
                {due.count > 20 ? ". Sessions take 20 at a time." : "."}
              </p>
              <form action={startReviewAction} className="mt-4">
                <Button type="submit">Start review</Button>
              </form>
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
                  <span className="text-muted-foreground">
                    {u.count} question{u.count === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[13px] text-muted-foreground">
            Intervals after each right answer: {INTERVAL_DAYS.join(", ")} days, then the question leaves the queue.
          </p>
        </Card>
      </div>
    </>
  );
}
