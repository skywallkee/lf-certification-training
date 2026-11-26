"use client";

import { useState } from "react";
import { formatShort } from "@/lib/dates";

export interface WeekBar {
  week: string;
  value: number;
}

const short = (week: string) => formatShort(week).replace(/ \d{4}$/, "");

/** Rounds up to a tidy axis maximum (1, 2, 5 times a power of ten). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/**
 * One series of weekly counts as bars: thin bars with rounded tops, a recessive grid, a hover/focus tooltip and a
 * table view. `unit` names the value in the tooltip and table ("learners", "cluster minutes").
 */
export function WeeklyBars({ points, unit, summary, label }: { points: WeekBar[]; unit: string; summary: string; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const band = (W - pad.l - pad.r) / Math.max(1, points.length);
  const barW = Math.min(28, band - 4);
  const x = (i: number) => pad.l + i * band + (band - barW) / 2;
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const fmt = new Intl.NumberFormat("en");
  const every = points.length > 14 ? Math.ceil(points.length / 7) : points.length > 8 ? 2 : 1;
  const a = active !== null ? points[active] : undefined;
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm text-muted-foreground">{summary}</figcaption>
      <div className="relative w-full overflow-x-auto" tabIndex={0} role="region" aria-label={`${label} chart, scrolls sideways on small screens`}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label={summary} onMouseLeave={() => setActive(null)}>
          {[0, max / 2, max].map((g) => (
            <g key={g}>
              <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="var(--color-border)" strokeWidth="1" />
              <text x={pad.l - 6} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted-foreground)">
                {fmt.format(g)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % every === 0 || i === points.length - 1 ? (
              <text key={p.week} x={x(i) + barW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--color-muted-foreground)">
                {short(p.week)}
              </text>
            ) : null,
          )}
          {points.map((p, i) => {
            const h = Math.max(0, y(0) - y(p.value));
            const r = Math.min(4, h, barW / 2);
            const top = y(0) - h;
            const d = h <= 0 ? "" : `M${x(i)},${y(0)} V${top + r} Q${x(i)},${top} ${x(i) + r},${top} H${x(i) + barW - r} Q${x(i) + barW},${top} ${x(i) + barW},${top + r} V${y(0)} Z`;
            return (
              <g
                key={p.week}
                tabIndex={0}
                role="presentation"
                className="outline-none [&:focus-visible>rect]:stroke-foreground"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <rect x={pad.l + i * band} y={pad.t} width={band} height={H - pad.t - pad.b} fill={active === i ? "var(--color-muted)" : "transparent"} strokeWidth="1" />
                {d ? <path d={d} fill="var(--color-primary)" /> : null}
              </g>
            );
          })}
        </svg>
        {a ? (
          <div
            role="status"
            className="pointer-events-none absolute top-0 whitespace-nowrap rounded-md border bg-card px-3 py-2 text-xs shadow"
            style={{ left: `${((x(active!) + barW / 2) / W) * 100}%`, transform: "translateX(-50%)" }}
          >
            Week of {short(a.week)}: <span className="font-semibold">{fmt.format(a.value)}</span> {unit}
          </div>
        ) : null}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-primary">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="py-1 font-semibold">Week of</th>
              <th scope="col" className="py-1 font-semibold capitalize">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.week} className="border-t">
                <td className="py-1">{formatShort(p.week)}</td>
                <td className="py-1">{fmt.format(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
