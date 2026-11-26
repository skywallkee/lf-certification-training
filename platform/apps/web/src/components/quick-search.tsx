"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { KIND_LABEL, tokenize, type SearchResult } from "@/lib/search";
import { cn } from "@/lib/utils";
import { Highlight } from "./highlight";

/** Typing in a field, or the lab terminal, keeps "/" for itself. */
function typingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || Boolean(el.closest(".xterm"));
}

/**
 * Quick search from any page: the header button, "/" or Ctrl/Cmd+K open a dialog that shows the best
 * eight results as you type (a combobox: arrows move, Enter opens, Escape closes). Enter with nothing
 * picked, or "See all results", opens the Search page with filters.
 */
export function QuickSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState("");
  const [active, setActive] = useState(-1);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const input = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active >= 0) scroller.current?.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = (e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey) && !e.altKey;
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typingTarget(e.target);
      if (combo || slash) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (tokenize(term).length === 0) {
      setResults([]);
      setSearched("");
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal, cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { results: SearchResult[] };
        setResults(body.results);
        setSearched(term);
        setActive(-1);
      } catch {
        if (!ctrl.signal.aborted) {
          setResults([]);
          setSearched(term);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const allHref = `/search?q=${encodeURIComponent(q.trim())}`;
  const tokens = tokenize(searched);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="/ Control+K Meta+K"
        className={cn(
          "inline-flex min-h-10 items-center gap-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
          "px-2.5 sm:min-w-56 sm:border sm:bg-background sm:px-3",
          className,
        )}
      >
        <Search aria-hidden="true" className="size-4" />
        <span className="sr-only sm:not-sr-only">Search</span>
        <kbd aria-hidden="true" className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-xs sm:inline">
          /
        </kbd>
      </button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setActive(-1);
        }}
      >
        <DialogContent
          className="top-4 max-w-xl translate-y-0 p-0 sm:top-[12vh]"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            input.current?.focus();
            input.current?.select();
          }}
        >
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Certs, competencies, lessons, questions, labs and mock exams. Use the arrow keys to pick a result and Enter to open it.
          </DialogDescription>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const pick = results[active];
              if (pick) go(pick.href);
              else if (q.trim()) go(allHref);
            }}
            className="flex items-center gap-2 border-b px-4"
          >
            {loading ? (
              <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            )}
            <input
              ref={input}
              type="search"
              role="combobox"
              aria-label="Search"
              aria-expanded={results.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? optionId(active) : undefined}
              autoComplete="off"
              spellCheck={false}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && results.length) {
                  e.preventDefault();
                  setActive((a) => (a + 1) % results.length);
                } else if (e.key === "ArrowUp" && results.length) {
                  e.preventDefault();
                  setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
                }
              }}
              placeholder="Search lessons, labs, mock exams…"
              className="min-h-14 w-full min-w-0 bg-transparent [&::-webkit-search-cancel-button]:hidden text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd aria-hidden="true" className="hidden rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground sm:inline">
              Esc
            </kbd>
            <DialogClose className="min-h-10 shrink-0 rounded-md px-2 text-sm font-medium text-primary hover:bg-muted sm:hidden">Cancel</DialogClose>
          </form>
          <div ref={scroller} tabIndex={results.length ? 0 : -1} aria-label="Search results, scrollable" className="max-h-[min(60vh,28rem)] overflow-y-auto">
            <ul id={listId} role="listbox" aria-label="Results" className="flex flex-col p-2">
              {results.map((r, i) => (
                <li
                  key={`${r.kind}-${r.href}-${r.title}`}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(r.href)}
                  className={cn("flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2.5", i === active && "bg-muted")}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {KIND_LABEL[r.kind]} · {r.cert}
                    {r.mock ? " · Sample" : ""}
                  </span>
                  <span className="line-clamp-2 break-words text-[15px] font-medium text-foreground">
                    <Highlight text={r.title} tokens={tokens} />
                  </span>
                  {r.snippet ? (
                    <span className="line-clamp-2 break-words text-sm text-muted-foreground">
                      <Highlight text={r.snippet} tokens={tokens} />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p aria-live="polite" className={cn("px-5 text-sm text-muted-foreground", (searched && results.length === 0) || !q.trim() ? "pb-4 pt-2" : "sr-only")}>
              {!q.trim()
                ? "Type at least two letters. Try: pod, storage class, RBAC, CKA."
                : searched && results.length === 0
                  ? `No results for "${searched}". Try a shorter or different word.`
                  : searched
                    ? `${results.length} result${results.length === 1 ? "" : "s"}`
                    : ""}
            </p>
          </div>
          {q.trim() ? (
            <div className="border-t p-2">
              <button
                type="button"
                onClick={() => go(allHref)}
                className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-sm font-medium text-primary hover:bg-muted"
              >
                See all results and filters
                <ArrowRight aria-hidden="true" className="size-4" />
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
