import Link from "next/link";
import { CertTile } from "@/components/cert-tile";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { formatLong } from "@/lib/dates";
import { PATH_GROUPS } from "@/lib/path";
import { pct } from "@/lib/readiness";
import { en } from "@/messages/en";
import { getCatalog } from "@/server/catalog";
import { getReadiness, getStatusViews, heldCerts } from "@/server/progress";
import type { getProfile } from "@/server/session";
import { learnerToday } from "@/server/today";

const LEGEND: { status: keyof typeof en.status; text: string }[] = [
  { status: "passed", text: en.status.passed },
  { status: "booked", text: "Booked or studying" },
  { status: "expiring", text: en.status.expiring },
  { status: "not-started", text: en.status["not-started"] },
];

type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

/**
 * The signed-in view of /certs: every cert as a tile with the learner's own status, readiness and a focus control.
 * Opening a tile leads to the cert page, which holds its lessons, practice and the exam status form.
 */
export async function PathMap({ userId, profile }: { userId: string; profile: Profile }) {
  const user = { id: userId };
  const today = learnerToday(profile);
  const catalog = await getCatalog();
  const views = await getStatusViews(user.id, catalog, today, profile.focusCert);
  const held = heldCerts(views);
  const active = [...views].filter(([, v]) => v.status === "booked" || v.status === "studying").map(([c]) => c);
  const readiness = new Map(
    await Promise.all(
      active.map(async (code) => {
        const r = await getReadiness(user.id, catalog.certs.get(code)!, today);
        return [code, r.sufficient ? pct(r.score) : null] as const;
      }),
    ),
  );
  const booked = [...views.values()].filter((v) => v.status === "booked").length;
  const total = catalog.certs.size;
  const expiring = [...views].filter(([, v]) => v.status === "expiring" || v.status === "expired");
  const future = [...catalog.certs.values()].filter((c) => c.requiredFrom && c.requiredFrom > today);
  const noneStarted = [...views.values()].every((v) => v.status === "not-started");

  return (
    <>
      <PageHeader
        title="Certifications"
        lead={`Your path to all ${total} Golden Kubestronaut certs: ${held.size} passed · ${booked} booked · ${total - held.size - booked} to go. Every cert must be current at the same time.`}
      />
      <p className="-mt-2 mb-4 text-[15px]">Open a cert to read its lessons, practise it, and set your exam date. Use <strong>Set as focus</strong> for the one you are studying now: Today and your plan follow it.</p>
      <ul aria-label="Legend" className="mb-6 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        {LEGEND.map((l) => (
          <li key={l.status}>
            <StatusChip status={l.status} label={l.text} />
          </li>
        ))}
      </ul>

      {expiring.length > 0 || future.length > 0 ? (
        <div role="status" className="mb-6 flex flex-col gap-1 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm">
          {expiring.map(([code, v]) => (
            <p key={code}>
              <strong>
                {code} {v.status === "expired" ? "expired" : "expires"} on {formatLong(v.expiresOn!)}.
              </strong>{" "}
              Renew it to stay on the path. <Link href={`/certs/${code.toLowerCase()}#status`}>Update its status</Link>
            </p>
          ))}
          {future.map((c) => (
            <p key={c.code}>
              {c.code} joins the Golden Kubestronaut bundle on {formatLong(c.requiredFrom!)}.
            </p>
          ))}
        </div>
      ) : null}

      {noneStarted ? (
        <p className="mb-6 rounded-lg border bg-card px-4 py-3 text-[15px]">
          New to the path? Most learners start with <Link href="/certs/kcna">KCNA</Link>: it covers the basics every other cert builds on.
        </p>
      ) : null}

      <div className="flex flex-col gap-8">
        {PATH_GROUPS.map((group) => (
          <section key={group.key} aria-labelledby={`group-${group.key}`} className="flex flex-col gap-3">
            <h2 id={`group-${group.key}`} className="text-sm font-semibold text-muted-foreground">
              {group.name}
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
              {group.certs.map((code) => {
                const cert = catalog.certs.get(code);
                if (!cert) return null;
                return (
                  <CertTile
                    key={code}
                    cert={cert}
                    view={views.get(code)!}
                    today={today}
                    focus={profile.focusCert === code}
                    readinessPct={readiness.get(code) ?? null}
                    held={held}
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
