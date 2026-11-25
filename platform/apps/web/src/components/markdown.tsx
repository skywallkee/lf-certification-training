import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown for question stems and explanations: no raw HTML, links open in a new tab. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`md-inline ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {c}
            </a>
          ),
          pre: ({ node: _node, ...props }) => <pre {...props} tabIndex={0} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
