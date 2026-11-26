import { AlertTriangle, CheckCircle2, CircleDashed, Clock, BookOpen, XCircle } from "lucide-react";
import type { CertDisplayStatus } from "@/lib/cert-status";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

const STYLES: Record<CertDisplayStatus, { cls: string; Icon: typeof CheckCircle2 }> = {
  "not-started": { cls: "bg-muted text-muted-foreground", Icon: CircleDashed },
  studying: { cls: "bg-primary-soft text-primary", Icon: BookOpen },
  booked: { cls: "bg-primary-soft text-primary", Icon: Clock },
  passed: { cls: "bg-success-soft text-success", Icon: CheckCircle2 },
  expiring: { cls: "bg-warning-soft text-warning", Icon: AlertTriangle },
  expired: { cls: "bg-destructive-soft text-destructive", Icon: XCircle },
};

/** Icon plus word: status is never colour alone. */
export function StatusChip({ status, className }: { status: CertDisplayStatus; className?: string }) {
  const { cls, Icon } = STYLES[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", cls, className)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {en.status[status]}
    </span>
  );
}

/** An unpublished item: only admins see it, in the editor or by its link. */
export function DraftBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border border-primary px-2 py-0.5 text-xs font-semibold text-primary", className)}
      title="Not published: learners cannot see it yet"
    >
      Draft
    </span>
  );
}

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border border-warning px-2 py-0.5 text-xs font-semibold text-warning", className)}
      title={en.sampleExplainer}
    >
      {en.sampleLabel}
    </span>
  );
}
