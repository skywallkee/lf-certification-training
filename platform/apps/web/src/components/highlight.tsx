import { highlightParts } from "@/lib/search";

/** Text with the search tokens wrapped in <mark>. */
export function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  return (
    <>
      {highlightParts(text, tokens).map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-sm bg-primary-soft font-semibold text-inherit">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
