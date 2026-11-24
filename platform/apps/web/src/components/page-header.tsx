import type { ReactNode } from "react";

export function PageHeader({ title, eyebrow, lead, actions }: { title: string; eyebrow?: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-[30px] font-bold">{title}</h1>
        {lead ? <div className="mt-1.5 text-[15px] text-muted-foreground">{lead}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
