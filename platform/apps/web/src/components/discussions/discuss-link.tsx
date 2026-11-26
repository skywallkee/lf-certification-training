import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { discussPath, type TargetType } from "@/lib/discussions";

/** "Discussion (3)": a link to a target's discussion page, for lists where the discussion does not fit inline. */
export function DiscussLink({ type, id, count, newTab = false, className }: { type: TargetType; id: string; count: number; newTab?: boolean; className?: string }) {
  return (
    <Link
      href={discussPath(type, id)}
      className={`inline-flex items-center gap-1.5 text-sm font-medium ${className ?? ""}`}
      {...(newTab ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      <MessagesSquare aria-hidden="true" className="size-4" />
      Discussion ({count})
      {newTab ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </Link>
  );
}
