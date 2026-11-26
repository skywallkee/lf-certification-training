"use client";

import { useState } from "react";
import { formatShort } from "@/lib/dates";

interface Point {
  week: string;
  score: number | null;
  answers: number;
}

/** Readiness over the last weeks: one 2px line, 8px markers, hover/focus tooltip, and a table view. */
export function ReadinessHistory({ points }: { points: Point[] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const pad = { l: 40, r: 16, t: 12, b: 28 };
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const scored = points.map((p, i) => ({ ...p, i })).filter((p) => p.score !== null);
  const path = scored.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.score!).toFixed(1)}`).join(" ");
  const first = scored[0];
  const last = scored[scored.length - 1];
  const summary =
    scored.length === 0
      ? "Not enough answers in any week yet to show a readiness line."
      : `Readiness went from ${Math.round(first!.score! * 100)}% in the week of ${formatShort(first!.week)} to ${Math.round(last!.score! * 100)}% in the week of ${formatShort(last!.week)}.`;
  const a = active !== null ? points[active] : undefined;
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm text-muted-foreground">{summary}</figcaption>
      {scored.length > 0 ? (
        <div className="relative w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Chart, scrolls sideways on small screens">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" role="img" aria-label={summary}>
            {[0, 0.5, 0.8, 1].map((g) => (
              <g key={g}>
                <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="var(--color-border)" strokeWidth="1" strokeDasharray={g === 0.8 ? "4 4" : undefined} />
                <text x={pad.l - 6} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted-foreground)">
                  {Math.round(g * 100)}%
                </text>
              </g>
            ))}
            <text x={W - pad.r} y={y(0.8) - 4} textAnchor="end" fontSize="11" fill="var(--color-muted-foreground)">
              Book-ready
            </text>
            {points.map((p, i) => (
              <text key={p.week} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--color-muted-foreground)">
                {formatShort(p.week).replace(/ \d{4}$/, "")}
              </text>
            ))}
            {active !== null ? <line x1={x(active)} x2={x(active)} y1={pad.t} y2={H - pad.b} stroke="var(--color-input)" strokeWidth="1" /> : null}
            <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" />
            {points.map((p, i) =>
              p.score === null ? null : (
                <g key={p.week} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
                  <circle cx={x(i)} cy={y(p.score)} r="12" fill="transparent" />
                  <circle cx={x(i)} cy={y(p.score)} r="4" fill="var(--color-primary)" stroke="var(--color-card)" strokeWidth="2" />
                </g>
              ),
            )}
          </svg>
          {a && a.score !== null ? (
            <div
              role="status"
              className="pointer-events-none absolute top-0 rounded-md border bg-card px-3 py-2 text-xs shadow"
              style={{ left: `${(x(active!) / W) * 100}%`, transform: "translateX(-50%)" }}
            >
              <span className="font-semibold">{Math.round(a.score * 100)}%</span> · week of {formatShort(a.week)} · {a.answers} answers
            </div>
          ) : null}
        </div>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer text-primary">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="py-1 font-semibold">Week ending</th>
              <th scope="col" className="py-1 font-semibold">Readiness</th>
              <th scope="col" className="py-1 font-semibold">Answers so far</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.week} className="border-t">
                <td className="py-1">{formatShort(p.week)}</td>
                <td className="py-1">{p.score === null ? "Not enough evidence" : `${Math.round(p.score * 100)}%`}</td>
                <td className="py-1">{p.answers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
