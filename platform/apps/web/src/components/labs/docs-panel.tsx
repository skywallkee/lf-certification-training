"use client";

import { useState } from "react";
import { ExternalLink, Home } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DocsLink {
  title: string;
  /** The page on its own site. */
  url: string;
  /** The page through the lab controller's docs viewer, or null if the site is not allowlisted. */
  viewerUrl: string | null;
}

/**
 * The official documentation, inside the lab player. Pages load through the lab controller's docs viewer so
 * sites that forbid framing still show; the frame stays loaded while the learner switches back to the
 * exercises. "Open in a new window" is the fallback when the viewer cannot reach a site.
 */
export function DocsPanel({ links, selected: rawSelected = 0, onSelect }: { links: DocsLink[]; selected?: number; onSelect?: (index: number) => void }) {
  const framable = links.filter((l) => l.viewerUrl);
  const [selected, setSelectedState] = useState(rawSelected < framable.length ? rawSelected : 0);
  const setSelected = (i: number) => {
    setSelectedState(i);
    onSelect?.(i);
  };
  const [src, setSrc] = useState(framable[selected]?.viewerUrl ?? null);
  const [reloads, setReloads] = useState(0);
  const page = framable[selected];

  if (!page || !src) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-muted-foreground">No documentation can be shown here. These links open in a new window:</p>
        <ul className="list-disc pl-5">
          {links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="docs-page">
          Documentation page
        </label>
        <select
          id="docs-page"
          className="min-h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm"
          value={selected}
          onChange={(e) => {
            const i = Number(e.target.value);
            setSelected(i);
            setSrc(framable[i]!.viewerUrl);
            setReloads((r) => r + 1);
          }}
        >
          {framable.map((l, i) => (
            <option key={l.url} value={i}>
              {l.title}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setSrc(page.viewerUrl);
            setReloads((r) => r + 1);
          }}
        >
          <Home aria-hidden="true" />
          Back to this page
        </Button>
        <a href={page.url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}>
          <ExternalLink aria-hidden="true" />
          Open in a new window
        </a>
      </div>
      <iframe
        key={`${src}#${reloads}`}
        src={src}
        title={`Documentation: ${page.title}`}
        className="min-h-[420px] w-full flex-1 rounded-md border bg-white"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
      <p className="text-xs text-muted-foreground">Only the official documentation sites open here, as in the exam.</p>
    </div>
  );
}
