import type { Diagram, DiagramEdge, DiagramIcon, DiagramNode } from "@lfct/curriculum";
import {
  Box,
  Boxes,
  Cog,
  Cpu,
  Database,
  DoorOpen,
  FileCog,
  FileText,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  type LucideIcon,
  Network,
  Package,
  Router,
  Server,
  Shield,
  Shuffle,
  Square,
  User,
  Waypoints,
  Copy as CopyIcon,
} from "lucide-react";

/**
 * Draws a lesson diagram (front matter `diagrams`, lesson-media.ts) as inline SVG: nodes on a grid with an icon,
 * a label and an optional second line; arrows between them; dashed boxes around groups. Colours come from the
 * theme tokens, so it follows light and dark mode. Shared by the written lesson (server) and the lesson video
 * (client), which passes `visible` and `highlight` to reveal it step by step. Screen readers get the title and a
 * text list of every node and connection.
 */

const ICONS: Record<DiagramIcon, LucideIcon> = {
  pod: Box,
  service: Network,
  deployment: Layers,
  replicaset: CopyIcon,
  node: Server,
  "control-plane": Cpu,
  user: User,
  container: Package,
  volume: HardDrive,
  config: FileCog,
  secret: KeyRound,
  ingress: DoorOpen,
  gateway: Router,
  dns: Waypoints,
  proxy: Shuffle,
  policy: Shield,
  database: Database,
  internet: Globe,
  cluster: Boxes,
  file: FileText,
  process: Cog,
  generic: Square,
};

const CELL_W = 268;
const CELL_H = 136;
const BOX_W = 188;
const BOX_H = 62;
const PAD = 24;

const TONE: Record<string, { box: string; icon: string }> = {
  default: { box: "fill-card stroke-input", icon: "text-foreground" },
  primary: { box: "fill-primary-soft stroke-primary", icon: "text-primary" },
  success: { box: "fill-success-soft stroke-success", icon: "text-success" },
  warning: { box: "fill-warning-soft stroke-warning", icon: "text-warning" },
  muted: { box: "fill-muted stroke-border", icon: "text-muted-foreground" },
};

function center(n: DiagramNode) {
  return { x: PAD + n.col * CELL_W + CELL_W / 2, y: PAD + n.row * CELL_H + CELL_H / 2 + 14 };
}

/** Where the line from a box's centre towards (dx, dy) leaves the box. */
function exitPoint(c: { x: number; y: number }, dx: number, dy: number, gap: number) {
  const hw = BOX_W / 2 + gap;
  const hh = BOX_H / 2 + gap;
  const t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Squeezes text that would overflow its box instead of letting it spill out. */
function squeeze(text: string, px: number, room: number) {
  return text.length * px > room ? { textLength: room, lengthAdjust: "spacingAndGlyphs" as const } : {};
}

function edgeKey(e: DiagramEdge) {
  return e.id ?? `${e.from}-${e.to}`;
}

export function DiagramView({
  diagram,
  visible,
  highlight,
  showCaption = true,
  fit = false,
  className,
}: {
  diagram: Diagram;
  /** Ids to draw; everything when left out. Hidden elements keep their place, so the layout never jumps. */
  visible?: ReadonlySet<string>;
  /** Ids to emphasise (the current video step). */
  highlight?: ReadonlySet<string>;
  showCaption?: boolean;
  /** Scale to fit the parent's width and height (the video stage) instead of scrolling sideways. */
  fit?: boolean;
  className?: string;
}) {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const cols = Math.max(...diagram.nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...diagram.nodes.map((n) => n.row)) + 1;
  const width = PAD * 2 + cols * CELL_W;
  const height = PAD * 2 + rows * CELL_H + 14;
  const shown = (id: string) => !visible || visible.has(id);
  const lit = (id: string) => highlight?.has(id) ?? false;
  const fade = "transition-opacity duration-500 ease-out motion-reduce:transition-none";
  const markerId = `arrow-${diagram.title.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;

  return (
    <figure className={className ?? "my-6"}>
      <div
        className={fit ? "h-full" : "overflow-x-auto rounded-lg border bg-surface"}
        {...(fit ? {} : { tabIndex: 0, role: "region", "aria-label": `Diagram: ${diagram.title}, scrolls sideways` })}
      >
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={fit ? { height: "100%" } : { minWidth: Math.min(width, 560), maxHeight: 520 }} role="img" aria-labelledby={`${markerId}-t`} className="block text-foreground">
          <title id={`${markerId}-t`}>{diagram.title}</title>
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-muted-foreground" />
            </marker>
            <marker id={`${markerId}-lit`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-primary" />
            </marker>
          </defs>

          {diagram.groups.map((g) => {
            const members = g.nodes.map((id) => byId.get(id)).filter((n) => n !== undefined);
            if (members.length === 0) return null;
            const xs = members.map((n) => center(n).x);
            const ys = members.map((n) => center(n).y);
            const x = Math.min(...xs) - BOX_W / 2 - 14;
            const y = Math.min(...ys) - BOX_H / 2 - 30;
            const w = Math.max(...xs) - Math.min(...xs) + BOX_W + 28;
            const h = Math.max(...ys) - Math.min(...ys) + BOX_H + 44;
            return (
              <g key={g.id} className={fade} opacity={shown(g.id) ? 1 : 0}>
                <rect x={x} y={y} width={w} height={h} rx={12} className={lit(g.id) ? "fill-primary-soft stroke-primary" : "fill-none stroke-input"} strokeDasharray="6 5" strokeWidth={lit(g.id) ? 2 : 1.25} />
                {/* Top right: arrows usually arrive from the left, so the label stays clear of them. */}
                <text x={x + w - 12} y={y + 18} textAnchor="end" className={lit(g.id) ? "fill-primary" : "fill-muted-foreground"} fontSize={12} fontWeight={600}>
                  {g.label}
                </text>
              </g>
            );
          })}

          {diagram.edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const ca = center(a);
            const cb = center(b);
            const dx = cb.x - ca.x;
            const dy = cb.y - ca.y;
            const p1 = exitPoint(ca, dx, dy, 2);
            const p2 = exitPoint(cb, -dx, -dy, 4);
            const id = edgeKey(e);
            const on = lit(id);
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            const labelW = e.label ? e.label.length * 6.6 + 12 : 0;
            return (
              <g key={id} className={fade} opacity={shown(id) ? 1 : 0}>
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  className={on ? "stroke-primary" : "stroke-muted-foreground"}
                  strokeWidth={on ? 2.5 : 1.5}
                  strokeDasharray={e.dashed ? "6 5" : undefined}
                  markerEnd={`url(#${markerId}${on ? "-lit" : ""})`}
                  markerStart={e.both ? `url(#${markerId}${on ? "-lit" : ""})` : undefined}
                />
                {e.label ? (
                  <g>
                    <rect x={mx - labelW / 2} y={my - 10} width={labelW} height={20} rx={5} className="fill-background" opacity={0.92} />
                    <text x={mx} y={my + 4} textAnchor="middle" fontSize={11.5} className={on ? "fill-primary" : "fill-muted-foreground"} fontFamily="var(--font-mono)">
                      {e.label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {diagram.nodes.map((n) => {
            const c = center(n);
            const Icon = ICONS[n.icon];
            const tone = TONE[n.tone] ?? TONE.default!;
            const on = lit(n.id);
            const x = c.x - BOX_W / 2;
            const y = c.y - BOX_H / 2;
            return (
              <g key={n.id} className={fade} opacity={shown(n.id) ? 1 : 0}>
                <rect x={x} y={y} width={BOX_W} height={BOX_H} rx={10} className={on ? "fill-primary-soft stroke-primary" : tone.box} strokeWidth={on ? 2.5 : 1.25} />
                <Icon x={x + 12} y={c.y - 11} width={22} height={22} className={on ? "text-primary" : tone.icon} aria-hidden="true" />
                <text x={x + 44} y={n.sub ? c.y - 3 : c.y + 5} fontSize={14} fontWeight={600} className="fill-foreground" {...squeeze(n.label, 7.8, BOX_W - 54)}>
                  {n.label}
                </text>
                {n.sub ? (
                  <text x={x + 44} y={c.y + 15} fontSize={11.5} className="fill-muted-foreground" fontFamily="var(--font-mono)" {...squeeze(n.sub, 7, BOX_W - 54)}>
                    {n.sub}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      {showCaption ? (
        <figcaption className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{diagram.title}.</span> {diagram.caption ?? ""}
        </figcaption>
      ) : null}
      <div className="sr-only">
        <p>Parts:</p>
        <ul>
          {diagram.nodes.map((n) => (
            <li key={n.id}>
              {n.label}
              {n.sub ? ` (${n.sub})` : ""}
              {diagram.groups.filter((g) => g.nodes.includes(n.id)).map((g) => `, in ${g.label}`).join("")}
            </li>
          ))}
        </ul>
        {diagram.edges.length > 0 ? (
          <>
            <p>Connections:</p>
            <ul>
              {diagram.edges.map((e) => (
                <li key={edgeKey(e)}>
                  {byId.get(e.from)?.label} {e.both ? "and" : "to"} {byId.get(e.to)?.label}
                  {e.label ? `: ${e.label}` : ""}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </figure>
  );
}
