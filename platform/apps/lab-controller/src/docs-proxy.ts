import type http from "node:http";

/**
 * Serves allowlisted documentation sites for the lab player's docs pane. A request to
 * `http://kubernetes.io.localhost:3001/docs/home/` is fetched from `https://kubernetes.io/docs/home/`; the
 * answer loses the headers that forbid framing (X-Frame-Options, CSP) and gains a CSP that lets only the web
 * app frame it. Links in HTML pages to an allowlisted site are rewritten to stay in the viewer. Read-only:
 * GET and HEAD, no cookies either way.
 */
export interface DocsProxyOptions {
  hosts: readonly string[];
  /** Origins allowed to frame the docs (the web app). */
  allowedOrigins: readonly string[];
  /** Base URL of a site; tests point it at a local server. */
  upstream?: (host: string) => string;
  fetchImpl?: typeof fetch;
}

const PASS_HEADERS = ["content-type", "cache-control", "last-modified", "etag", "expires"];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function createDocsProxy(opts: DocsProxyOptions) {
  const upstream = opts.upstream ?? ((host: string) => `https://${host}`);
  const doFetch = opts.fetchImpl ?? fetch;
  // "https://kubernetes.io", "http://kubernetes.io" or "//kubernetes.io", not followed by more host name.
  const linkPattern = new RegExp(`(?:https?:)?//(${opts.hosts.map(escape).join("|")})(?![\\w.-])`, "g");

  /** The site a request is for, from its Host header, or null when it is not a docs request. */
  function siteFor(req: http.IncomingMessage): string | null {
    const host = (req.headers.host ?? "").toLowerCase();
    const m = /^(.+)\.localhost(?::\d+)?$/.exec(host);
    return m && opts.hosts.includes(m[1]!) ? m[1]! : null;
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse, site: string): Promise<void> {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" });
      res.end();
      return;
    }
    const port = /:(\d+)$/.exec(req.headers.host ?? "")?.[1];
    const viewerOrigin = (h: string) => `http://${h}.localhost${port ? `:${port}` : ""}`;
    let upstreamRes: Response;
    try {
      upstreamRes = await doFetch(`${upstream(site)}${req.url ?? "/"}`, {
        method: req.method,
        redirect: "manual",
        headers: {
          accept: req.headers.accept ?? "*/*",
          "accept-language": req.headers["accept-language"] ?? "en",
          "user-agent": "Mozilla/5.0 (compatible; LF Cert Trainer docs viewer)",
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Could not load ${site}: ${(err as Error).message}. Check this computer's internet connection.`);
      return;
    }

    const headers: Record<string, string> = {
      "content-security-policy": `frame-ancestors ${opts.allowedOrigins.join(" ") || "'none'"}`,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    };
    for (const name of PASS_HEADERS) {
      const value = upstreamRes.headers.get(name);
      if (value) headers[name] = value;
    }
    const location = upstreamRes.headers.get("location");
    if (location) headers.location = location.replace(linkPattern, (_m, h: string) => viewerOrigin(h));

    const type = upstreamRes.headers.get("content-type") ?? "";
    let body: Buffer;
    if (type.startsWith("text/html")) {
      const html = await upstreamRes.text();
      body = Buffer.from(html.replace(linkPattern, (_m, h: string) => viewerOrigin(h)));
    } else {
      // Scripts and styles pass through untouched, so subresource integrity still holds.
      body = Buffer.from(await upstreamRes.arrayBuffer());
    }
    headers["content-length"] = String(body.length);
    res.writeHead(upstreamRes.status, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  }

  return { siteFor, handle };
}
