import type { Metadata } from "next";
import { DeleteAccount, ProfileForm } from "@/components/forms/account-forms";
import { PageHeader } from "@/components/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { getProfile, requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const profile = await getProfile(user.id);
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
        <Card aria-labelledby="theme">
          <CardTitle id="theme">Theme</CardTitle>
          <p className="mt-2 text-[15px] text-muted-foreground">
            The app follows your system setting. Use the theme button in the top bar to pick light or dark on this device.
          </p>
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
