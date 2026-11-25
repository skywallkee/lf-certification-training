import { AlertTriangle, CheckCircle2, Clock, Loader2, Square, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const MAP: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  requested: { label: "Starting", cls: "bg-primary-soft text-primary", Icon: Loader2 },
  booting: { label: "Starting", cls: "bg-primary-soft text-primary", Icon: Loader2 },
  ready: { label: "Running", cls: "bg-primary-soft text-primary", Icon: Clock },
  finished: { label: "Finished", cls: "bg-success-soft text-success", Icon: CheckCircle2 },
  expired: { label: "Time ran out", cls: "bg-warning-soft text-warning", Icon: AlertTriangle },
  failed: { label: "Did not start", cls: "bg-destructive-soft text-destructive", Icon: XCircle },
  killed: { label: "Ended by admin", cls: "bg-muted text-muted-foreground", Icon: Square },
};

/** Icon plus word for a lab session's state. */
export function SessionStatus({ status, className }: { status: string; className?: string }) {
  const s = MAP[status] ?? MAP.killed!;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", s.cls, className)}>
      <s.Icon aria-hidden="true" className="size-3.5" />
      {s.label}
    </span>
  );
}

export function durationLabel(start: Date | null, end: Date | null): string {
  if (!start) return "–";
  const minutes = Math.max(0, Math.round(((end ?? new Date()).getTime() - start.getTime()) / 60_000));
  return `${minutes} min`;
}

export const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
