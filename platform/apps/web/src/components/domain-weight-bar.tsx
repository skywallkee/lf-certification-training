import type { DomainMastery } from "@/lib/readiness";
import { pct } from "@/lib/readiness";
import { Progress } from "./ui/progress";

const LEVEL_TEXT = { none: "No answers yet", low: "Low", medium: "Building", mastered: "Mastered" } as const;

/** One domain: official weight in the label, mastery as the fill, evidence count as text. */
export function DomainWeightBar({ domain, weakest }: { domain: DomainMastery; weakest?: boolean }) {
  const value = domain.answers === 0 ? 0 : pct(domain.mastery);
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 text-sm">
      <span className={weakest ? "font-semibold" : undefined}>
        {domain.name} · {domain.weight}%
      </span>
      <span className={weakest ? "font-semibold text-warning" : "text-muted-foreground"}>
        {domain.answers === 0 ? LEVEL_TEXT.none : `${value}%`}
      </span>
      <Progress
        className="col-span-2"
        value={value}
        tone={weakest ? "warning" : domain.level === "mastered" ? "success" : "primary"}
        label={`${domain.name} mastery`}
      />
    </div>
  );
}

export function weakestDomain(domains: DomainMastery[]): DomainMastery | undefined {
  const withEvidence = domains.filter((d) => d.answers > 0);
  return [...withEvidence].sort((a, b) => a.mastery - b.mastery)[0];
}
