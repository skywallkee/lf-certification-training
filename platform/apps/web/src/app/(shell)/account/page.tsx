import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { ChangePasswordForm, DeleteAccount, ProfileForm } from "@/components/forms/account-forms";
import { DiscussionEmailForm } from "@/components/forms/discussion-email-form";
import { RemindersForm } from "@/components/forms/plan-forms";
import { PageHeader } from "@/components/page-header";
import { ThemeChoice } from "@/components/theme-toggle";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { account, user as userTable } from "@/db/schema";
import { getProfile, requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const { password } = await searchParams;
  const user = await requireUser("/account");
  const profile = await getProfile(user.id);
  const [verified] = await getDb().select({ v: userTable.emailVerified }).from(userTable).where(eq(userTable.id, user.id));
  const [credential] = await getDb()
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, user.id), eq(account.providerId, "credential")))
    .limit(1);
  const zones = Intl.supportedValuesOf("timeZone");
  const tz = profile?.timeZone ?? "UTC";
  return (
    <>
      <PageHeader title="Account" lead={`Signed in as ${user.email}.`} />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="profile">
          <CardTitle id="profile" className="mb-4">
            Profile
          </CardTitle>
          <ProfileForm name={user.name} timeZone={tz} hours={profile?.hoursPerWeek ?? null} zones={zones.includes(tz) ? zones : [tz, ...zones]} />
        </Card>
        <Card aria-labelledby="password">
          <CardTitle id="password" className="mb-4">
            Password
          </CardTitle>
          {credential ? (
            <ChangePasswordForm changed={password === "changed"} />
          ) : (
            <p className="text-[15px] text-muted-foreground">
              You sign in with GitHub. To sign in with your email too, <Link href={`/forgot-password?email=${encodeURIComponent(user.email)}`}>set a password</Link>.
            </p>
          )}
        </Card>
        <Card aria-labelledby="reminders" id="reminders-card">
          <CardTitle id="reminders">Study reminders</CardTitle>
          <p className="mb-4 mt-2 text-[15px] text-muted-foreground">
            Emails that keep your <Link href="/plan">study plan</Link> on track. All off until you turn them on.
          </p>
          <RemindersForm
            weekly={profile?.remindWeekly ?? false}
            nudge={profile?.remindNudge ?? false}
            exam={profile?.remindExam ?? false}
            day={profile?.remindDay ?? 1}
            hour={profile?.remindHour ?? 8}
            timeZone={tz}
            verified={verified?.v ?? false}
          />
        </Card>
        <Card aria-labelledby="discussion-emails" id="discussion-emails-card">
          <CardTitle id="discussion-emails" className="mb-4">
            Discussion emails
          </CardTitle>
          <DiscussionEmailForm on={profile?.notifyDiscussions ?? true} verified={verified?.v ?? false} />
        </Card>
        <Card aria-labelledby="goal">
          <CardTitle id="goal">Goal and focus cert</CardTitle>
          <p className="mb-4 mt-2 text-[15px] text-muted-foreground">
            {profile?.focusCert ? `You are focusing on ${profile.focusCert}. ` : ""}Changed your plans? Go through the setup again; your progress stays.
          </p>
          <Link href="/onboarding" className="font-medium">
            Change my goal
          </Link>
        </Card>
        <Card aria-labelledby="appearance">
          <CardTitle id="appearance" className="mb-4">
            Appearance
          </CardTitle>
          <ThemeChoice className="max-w-md" />
          <p className="mt-3 text-sm text-muted-foreground">Saved on this device. The theme button in the top bar switches it too.</p>
        </Card>
        <Card aria-labelledby="danger" className="border-destructive/40">
          <CardTitle id="danger">Delete account</CardTitle>
          <p className="mb-4 mt-2 text-[15px] text-muted-foreground">Removes your account and all your study data from LF Cert Trainer.</p>
          <DeleteAccount />
        </Card>
      </div>
    </>
  );
}
