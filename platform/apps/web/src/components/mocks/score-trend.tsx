"use client";

import { useState } from "react";

export interface TrendPoint {
  id: string;
  /** ISO time the attempt started. */
  at: string;
  score: number;
  mode: string;
}

const dateFmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });
const fullFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const modeLabel = (mode: string) => (mode === "exam" ? "Exam mode" : "Practice mode");

/**
 * Scores of one mock exam's graded attempts, oldest to newest: one 2px line, filled markers for exam mode and
 * hollow ones for practice mode, the pass mark as a dashed rule, a hover/focus tooltip, and a table view.
 */
export function ScoreTrend({ points, passMark, title }: { points: TrendPoint[]; passMark: number; title: string }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { l: 40, r: 20, t: 16, b: 28 };
  const x = (i: number) => (points.length === 1 ? (W + pad.l - pad.r) / 2 : pad.l + (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const summary =
    !first || !last
      ? `No graded attempts of ${title} yet.`
      : points.length === 1
        ? `One graded attempt of ${title}: ${last.score}% (pass mark ${passMark}%).`
        : `${title}: from ${first.score}% on ${dateFmt.format(new Date(first.at))} to ${last.score}% on ${dateFmt.format(new Date(last.at))} over ${points.length} attempts (pass mark ${passMark}%).`;
  const a = active !== null ? points[active] : undefined;
  const hasExam = points.some((p) => p.mode === "exam");
  const hasPractice = points.some((p) => p.mode !== "exam");

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm text-muted-foreground">{summary}</figcaption>
      {hasExam && hasPractice ? (
        <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <svg aria-hidden="true" width="10" height="10">
              <circle cx="5" cy="5" r="4" fill="var(--color-primary)" />
            </svg>
            Exam mode
          </li>
          <li className="flex items-center gap-1.5">
            <svg aria-hidden="true" width="10" height="10">
              <circle cx="5" cy="5" r="3.5" fill="var(--color-card)" stroke="var(--color-primary)" strokeWidth="1.5" />
            </svg>
            Practice mode
          </li>
        </ul>
      ) : null}
      {points.length > 0 ? (
        <div className="relative w-full overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label={summary} onMouseLeave={() => setActive(null)}>
            {[0, 50, 100].map((g) => (
              <g key={g}>
                <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="var(--color-border)" strokeWidth="1" />
                <text x={pad.l - 6} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted-foreground)">
                  {g}%
                </text>
              </g>
            ))}
            <line x1={pad.l} x2={W - pad.r} y1={y(passMark)} y2={y(passMark)} stroke="var(--color-muted-foreground)" strokeWidth="1" strokeDasharray="4 4" />
            <text x={W - pad.r} y={y(passMark) - 5} textAnchor="end" fontSize="11" fill="var(--color-muted-foreground)">
              Pass mark {passMark}%
            </text>
            {points.map((p, i) => (
              <text key={p.id} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--color-muted-foreground)">
                {dateFmt.format(new Date(p.at))}
              </text>
            ))}
            {active !== null ? <line x1={x(active)} x2={x(active)} y1={pad.t} y2={H - pad.b} stroke="var(--color-input)" strokeWidth="1" /> : null}
            {points.length > 1 ? <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {points.map((p, i) => (
              <g
                key={p.id}
                tabIndex={0}
                role="presentation"
                className="outline-none [&:focus-visible>circle:last-child]:stroke-foreground"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <circle cx={x(i)} cy={y(p.score)} r="14" fill="transparent" />
                <circle
                  cx={x(i)}
                  cy={y(p.score)}
                  r="5"
                  fill={p.mode === "exam" ? "var(--color-primary)" : "var(--color-card)"}
                  stroke={p.mode === "exam" ? "var(--color-card)" : "var(--color-primary)"}
                  strokeWidth="2"
                />
              </g>
            ))}
          </svg>
          {a ? (
            <div
              role="status"
              className="pointer-events-none absolute top-0 whitespace-nowrap rounded-md border bg-card px-3 py-2 text-xs shadow"
              style={{ left: `${(x(active!) / W) * 100}%`, transform: "translateX(-50%)" }}
            >
              <span className="font-semibold">{a.score}%</span> · {modeLabel(a.mode)} · {fullFmt.format(new Date(a.at))}
            </div>
          ) : null}
        </div>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer text-primary">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="py-1 font-semibold">Started</th>
              <th scope="col" className="py-1 font-semibold">Mode</th>
              <th scope="col" className="py-1 font-semibold">Score</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="py-1">
                  <a href={`/mocks/results/${p.id}`}>{fullFmt.format(new Date(p.at))}</a>
                </td>
                <td className="py-1">{modeLabel(p.mode)}</td>
                <td className="py-1">
                  {p.score}% {p.score >= passMark ? "(pass)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** A tiny line of a domain's percent per attempt, beside the numbers it shows (decorative). */
export function Sparkline({ values }: { values: (number | null)[] }) {
  const W = 96;
  const H = 24;
  const known = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (known.length === 0) return null;
  const x = (i: number) => (values.length === 1 ? W / 2 : 3 + (i * (W - 6)) / (values.length - 1));
  const y = (v: number) => 3 + (1 - v / 100) * (H - 6);
  const d = known.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const end = known[known.length - 1]!;
  return (
    <svg aria-hidden="true" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <line x1="0" x2={W} y1={y(50)} y2={y(50)} stroke="var(--color-border)" strokeWidth="1" />
      {known.length > 1 ? <path d={d} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /> : null}
      <circle cx={x(end.i)} cy={y(end.v)} r="3" fill="var(--color-primary)" />
    </svg>
  );
}
