import Link from "next/link";
import { setFocusAction } from "@/app/actions/study";
import type { CertStatusView } from "@/lib/cert-status";
import { formatShort } from "@/lib/dates";
import { PREREQUISITES } from "@/lib/path";
import { cn } from "@/lib/utils";
import type { CatalogCert } from "@/server/catalog";
import { StatusChip } from "./status-chip";
import { Progress } from "./ui/progress";

function detail(view: CertStatusView, cert: CatalogCert, today: string, readinessPct: number | null): string | null {
  switch (view.status) {
    case "passed":
      return `Passed · expires ${formatShort(view.expiresOn!)}`;
    case "expiring":
      return `Expires ${formatShort(view.expiresOn!)}`;
    case "expired":
      return `Expired ${formatShort(view.expiresOn!)}`;
    case "booked":
      return view.bookedFor ? `Exam ${formatShort(view.bookedFor)}${readinessPct !== null ? ` · ${readinessPct}% ready` : ""}` : "Booked";
    default:
      if (cert.requiredFrom && cert.requiredFrom > today) return `Required from ${formatShort(cert.requiredFrom)}`;
      return null;
  }
}

/** One cert on the path map: code, name, status chip, readiness bar, next date, and a focus control. */
export function CertTile({
  cert,
  view,
  today,
  focus,
  readinessPct,
  held,
}: {
  cert: CatalogCert;
  view: CertStatusView;
  today: string;
  focus: boolean;
  readinessPct: number | null;
  held: Set<string>;
}) {
  const prereq = PREREQUISITES[cert.code];
  const needsPrereq = prereq && !held.has(prereq) && view.status !== "passed" && view.status !== "expiring";
  const text = detail(view, cert, today, readinessPct);
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-4",
        focus && "border-2 border-primary bg-primary-soft",
        view.status === "expiring" && "border-warning",
        view.status === "not-started" && !focus && "border-dashed border-input",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/certs/${cert.code.toLowerCase()}`} className="text-base font-bold text-foreground no-underline hover:underline">
          {cert.code}
          <span className="sr-only">: {cert.name}</span>
        </Link>
        {focus ? <span className="text-xs font-semibold uppercase tracking-wide text-primary">Focus</span> : null}
      </div>
      <p className="text-[13px] text-muted-foreground" aria-hidden="true">
        {cert.name}
      </p>
      <div>
        <StatusChip status={view.status} />
      </div>
      {text ? <p className={cn("text-[13px] font-medium", view.status === "expiring" || view.status === "expired" ? "text-warning" : "text-muted-foreground")}>{text}</p> : null}
      {needsPrereq ? <p className="text-[13px] text-muted-foreground">Needs a current {prereq}</p> : null}
      {readinessPct !== null && (view.status === "studying" || view.status === "booked") ? (
        <Progress value={readinessPct} label={`${cert.code} readiness`} />
      ) : null}
      {!focus && view.status !== "passed" && view.status !== "expiring" ? (
        <form action={setFocusAction} className="mt-auto pt-1">
          <input type="hidden" name="cert" value={cert.code} />
          <button type="submit" className="min-h-6 text-sm text-primary underline-offset-4 hover:underline">
            Set as focus<span className="sr-only"> cert: {cert.code}</span>
          </button>
        </form>
      ) : null}
    </li>
  );
}
