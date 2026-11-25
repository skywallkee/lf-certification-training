import { cn } from "@/lib/utils";

/** A labelled bar. `tone` changes the fill; the value is also given as text by the caller. */
export function Progress({
  value,
  label,
  tone = "primary",
  className,
}: {
  value: number;
  label: string;
  tone?: "primary" | "warning" | "success" | "muted";
  className?: string;
}) {
  const fill = { primary: "bg-primary", warning: "bg-warning", success: "bg-success", muted: "bg-muted-foreground" }[tone];
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      className={cn("h-2 w-full rounded-full bg-muted", className)}
    >
      <div className={cn("h-2 rounded-full", fill)} style={{ width: `${v}%` }} />
    </div>
  );
}
