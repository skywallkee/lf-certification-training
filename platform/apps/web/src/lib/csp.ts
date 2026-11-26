/**
 * The Content-Security-Policy for app pages. Scripts run only with this request's nonce ('strict-dynamic' lets
 * them load Next's chunks), so injected markup cannot run script even if a rendering bug let it through. The lab
 * player needs two more origins: the terminal WebSocket (LAB_TERMINAL_URL) and the docs viewer frames
 * (LAB_DOCS_URL, one subdomain per docs site).
 */
export interface CspOptions {
  nonce: string;
  dev: boolean;
  terminalUrl?: string;
  docsUrl?: string;
  /** GitHub sign-in on: a sign-in form that posts without JavaScript is redirected to github.com. */
  github: boolean;
}

/** "ws://localhost:3001/x" -> "ws://localhost:3001"; null when it is not a URL. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** "http://{host}.localhost:3001" -> "http://*.localhost:3001", a CSP source that matches every docs site. */
export function docsSource(template: string | undefined): string | null {
  if (!template?.includes("{host}")) return originOf(template);
  const sample = originOf(template.replace("{host}", "docs-site"));
  return sample ? sample.replace("docs-site", "*") : null;
}

export function buildCsp(o: CspOptions): string {
  const terminal = originOf(o.terminalUrl);
  const docs = docsSource(o.docsUrl);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${o.nonce}'`, "'strict-dynamic'", ...(o.dev ? ["'unsafe-eval'"] : [])],
    // React and xterm.js set inline styles.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(terminal ? [terminal] : []), ...(o.dev ? ["ws:"] : [])],
    "frame-src": docs ? [docs] : ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", ...(o.github ? ["https://github.com"] : [])],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}
