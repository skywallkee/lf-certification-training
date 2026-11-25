import type { Coverage } from "@/server/catalog";
import { cn } from "@/lib/utils";

/** Where content is still thin, so empty areas read as "coming", not "broken". */
export function CoverageBadge({ coverage, className }: { coverage: Coverage; className?: string }) {
  const cls = {
    full: "bg-success-soft text-success",
    partial: "bg-primary-soft text-primary",
    coming: "bg-muted text-muted-foreground",
  }[coverage.state];
  const text =
    coverage.state === "coming"
      ? "Content coming"
      : `${coverage.withLessons} of ${coverage.competencies} competencies have lessons`;
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", cls, className)}>{text}</span>;
}
