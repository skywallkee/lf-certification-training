import "server-only";

/** Server configuration, read once. Optional values switch features off rather than failing. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See platform/apps/web/.env.example.`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  /** Public base URL, used for links in emails and OAuth callbacks. */
  get baseUrl() {
    return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  },
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  get githubEnabled() {
    return Boolean(this.githubClientId && this.githubClientSecret);
  },
  /** Emails that get the admin role when their account is created. */
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  /**
   * Development only: show the last emails (verification links) on the verify page, since Phase 1 has no
   * mail provider. Never set in production.
   */
  showDevEmails: process.env.SHOW_DEV_EMAILS === "true" && process.env.NODE_ENV !== "production",
};
