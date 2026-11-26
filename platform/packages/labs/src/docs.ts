/**
 * The documentation viewer in the lab player. Exam rules allow the official docs, so the player shows them in
 * a pane next to the tasks. Docs sites may forbid framing, so the lab controller serves an allowlisted site
 * under a `<site>.localhost` host name (browsers resolve every `*.localhost` name to this machine) and drops
 * the headers that block framing. Only these sites are served.
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
 * The viewer URL for a docs link, or null when the site is not allowlisted (open it in a new window then).
 * `base` is a template such as `http://{host}.localhost:4001`.
 */
export function docsViewerUrl(link: string, base: string, hosts: readonly string[]): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !hosts.includes(url.hostname)) return null;
  return `${base.replace("{host}", url.hostname)}${url.pathname}${url.search}${url.hash}`;
}
