import type { Metadata } from "next";
import Link from "next/link";
import { CoverageBadge } from "@/components/coverage-badge";
import { PageHeader } from "@/components/page-header";
import { PATH_GROUPS } from "@/lib/path";
import { PathMap } from "@/components/path-map";
import { certRefs, coverageOf, getCatalog } from "@/server/catalog";
import { getProfile, getUser } from "@/server/session";

export const metadata: Metadata = { title: "Certifications" };

/** Signed-in learners get their own path map here; visitors and learners still onboarding get the public catalogue. */
export default async function CertsPage() {
  const user = await getUser();
  const profile = user ? await getProfile(user.id) : null;
  if (user && profile?.onboardedAt) return <PathMap userId={user.id} profile={profile} />;
  const catalog = await getCatalog();
  return (
    <>
      <PageHeader
        title="Certifications"
        lead="All 17 Golden Kubestronaut certs with their official domains, weights and competencies. Open a cert to read its lessons. Open to everyone."
      />
      <div className="flex flex-col gap-8">
        {PATH_GROUPS.map((group) => (
          <section key={group.key} aria-labelledby={`g-${group.key}`} className="flex flex-col gap-3">
            <h2 id={`g-${group.key}`} className="text-sm font-semibold text-muted-foreground">
              {group.name}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.certs.map((code) => {
                const cert = catalog.certs.get(code);
                if (!cert) return null;
                const refs = certRefs(cert);
                return (
                  <li key={code}>
                    <Link
                      href={`/certs/${code.toLowerCase()}`}
                      className="flex h-full flex-col gap-2 rounded-lg border bg-card p-4 text-foreground no-underline hover:border-primary hover:text-foreground"
                    >
                      <span className="text-base font-bold">{code}</span>
                      <span className="text-sm text-muted-foreground">{cert.name}</span>
                      <span className="text-[13px] text-muted-foreground">
                        {cert.examStyle === "performance" ? "Performance-based" : "Multiple choice"}
                        {cert.durationMinutes ? ` · ${cert.durationMinutes} min` : ""} · {cert.domains.length} domains · {refs.length} competencies
                      </span>
                      <span className="mt-auto pt-1">
                        <CoverageBadge coverage={coverageOf(catalog, refs)} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
