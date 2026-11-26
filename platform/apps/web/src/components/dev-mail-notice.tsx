import type { DevMail } from "@/server/dev-mail";

/** Local runs only: where to find the email, since nothing leaves the machine. Renders nothing otherwise. */
export function DevMailNotice({ mail, linkLabel }: { mail: DevMail; linkLabel: string }) {
  if (!mail.inboxUrl && !mail.link) return null;
  return (
    <div className="rounded-md border border-warning bg-warning-soft p-3 text-sm">
      <p className="font-semibold">Running locally</p>
      {mail.inboxUrl ? (
        <p className="mt-1">
          Emails go to the local mail catcher, not a real inbox: <a href={mail.inboxUrl} target="_blank" rel="noreferrer">open the local inbox</a>.
        </p>
      ) : null}
      {mail.link ? (
        <p className="mt-1">
          Development shortcut: <a href={mail.link}>{linkLabel}</a>
        </p>
      ) : null}
    </div>
  );
}
