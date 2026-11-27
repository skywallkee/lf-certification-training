/**
 * The documentation viewer in the lab player. Exam rules allow the official docs, so the player shows them in
 * a pane next to the tasks. Docs sites may forbid framing, so the lab controller serves an allowlisted site
 * under a `<site>.localhost` host name (browsers resolve every `*.localhost` name to this machine), or on a port
 * of its own on a self-hosted server, and drops the headers that block framing. Only these sites are served.
 */
export const DEFAULT_DOCS_HOSTS = ["kubernetes.io", "helm.sh"] as const;

/** Parses a comma-separated host list, falling back to the defaults. */
export function parseDocsHosts(raw: string | undefined): string[] {
  const hosts = (raw ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9.-]+$/.test(h));
  return hosts.length > 0 ? hosts : [...DEFAULT_DOCS_HOSTS];
}

/**
 * Where the viewer serves a site (LAB_DOCS_URL), in one of two forms:
 *
 *   http://{host}.localhost:4001                                   a template: one subdomain per site (local)
 *   kubernetes.io=https://box.ts.net:8444,helm.sh=https://box.ts.net:8445   one URL per site, e.g. one port each
 *                                                                  (Tailscale names have no wildcard subdomains)
 *
 * Either way each site gets its own origin, so a docs site's scripts never run on the app's origin.
 * Returns the base URL without a trailing slash, or null when the site has none.
 */
export function docsBaseFor(config: string, site: string): string | null {
  if (config.includes("{host}")) return config.replace("{host}", site).replace(/\/+$/, "");
  for (const part of config.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim().toLowerCase() === site) return part.slice(eq + 1).trim().replace(/\/+$/, "") || null;
  }
  return null;
}

/** The origins the viewer frames come from, for the app's Content-Security-Policy ("*" stands for a site). */
export function docsSources(config: string | undefined, hosts: readonly string[]): string[] {
  if (!config) return [];
  const origin = (u: string | null) => {
    try {
      return u ? new URL(u).origin : null;
    } catch {
      return null;
    }
  };
  if (config.includes("{host}")) {
    const sample = origin(config.replace("{host}", "docs-site"));
    return sample ? [sample.replace("docs-site", "*")] : [];
  }
  return [...new Set(hosts.map((h) => origin(docsBaseFor(config, h))).filter((o): o is string => o !== null))];
}

/**
 * The viewer URL for a docs link, or null when the site is not allowlisted (open it in a new window then).
 * `base` is LAB_DOCS_URL (see docsBaseFor).
 */
export function docsViewerUrl(link: string, base: string, hosts: readonly string[]): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !hosts.includes(url.hostname)) return null;
  const viewer = docsBaseFor(base, url.hostname);
  return viewer ? `${viewer}${url.pathname}${url.search}${url.hash}` : null;
}
