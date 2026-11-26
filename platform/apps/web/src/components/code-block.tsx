"use client";

import { Check, Copy } from "lucide-react";
import { type ComponentProps, useRef, useState } from "react";

/**
 * A code block with a Copy button, so learners can paste commands and manifests into a lab terminal. The
 * highlighted markup is rendered on the server and passed in as children. The block scrolls sideways on its
 * own (focusable, so keyboard users can scroll it) and the page never does.
 */
export function CodeBlock({ children, className, ...props }: ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = ref.current?.innerText.replace(/\n$/, "") ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); the text stays selectable.
    }
  }

  return (
    <div className="code-block relative">
      <pre ref={ref} {...props} className={className} tabIndex={0}>
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-white/20 bg-terminal px-2 py-1 text-xs font-medium text-terminal-foreground hover:bg-white/10 focus-visible:outline-2"
      >
        {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
        <span>{copied ? "Copied" : "Copy"}</span>
        <span className="sr-only"> code</span>
      </button>
      <span role="status" className="sr-only">
        {copied ? "Code copied to the clipboard" : ""}
      </span>
    </div>
  );
}
