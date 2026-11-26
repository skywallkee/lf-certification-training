import { evidenceSummary, pct, type Readiness } from "@/lib/readiness";
import { en } from "@/messages/en";

/** Weighted readiness with its band and evidence count, or "not enough evidence" below the threshold. */
export function ReadinessRing({ readiness, size = 96 }: { readiness: Readiness; size?: number }) {
  const r = size / 2 - 8;
  const circumference = 2 * Math.PI * r;
  const score = pct(readiness.score);
  if (!readiness.sufficient) {
    return (
      <div className="flex items-center gap-5">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-muted)" strokeWidth="10" strokeDasharray="4 6" />
          <text x="50%" y="54%" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--color-muted-foreground)">
            ?
          </text>
        </svg>
        <p className="text-sm text-muted-foreground">{en.readiness.little(readiness.answersNeeded || 1, readiness.domainsNeeded)}</p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Readiness ${score} percent`} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-muted)" strokeWidth="10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={readiness.ready ? "var(--color-success)" : "var(--color-primary)"}
          strokeWidth="10"
          strokeDasharray={`${(readiness.score * circumference).toFixed(1)} ${circumference.toFixed(1)}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="56%" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--color-foreground)">
          {score}%
        </text>
      </svg>
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <span>
          Range {pct(readiness.low)} to {pct(readiness.high)}%, from {evidenceSummary(readiness.bySource)}
        </span>
        <span>{readiness.ready ? "Ready to book" : en.readiness.bookReady}</span>
      </div>
    </div>
  );
}
