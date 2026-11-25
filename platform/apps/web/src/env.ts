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
   * mail provider. Never set in production; APP_ENV=local allows it in the local Docker stack, which runs a
   * production build on a laptop.
   */
  showDevEmails:
    process.env.SHOW_DEV_EMAILS === "true" && (process.env.NODE_ENV !== "production" || process.env.APP_ENV === "local"),
  /** Hands-on labs (Phase 2). The lab controller provisions sessions and relays the terminal. */
  labs: {
    /** Internal URL the server uses to call the controller. */
    get controllerUrl() {
      return process.env.LAB_CONTROLLER_URL ?? "http://localhost:3001";
    },
    get controllerSecret() {
      return process.env.LAB_CONTROLLER_SECRET ?? "";
    },
    get tokenSecret() {
      return process.env.LAB_TOKEN_SECRET ?? "";
    },
    /** Public WebSocket base the browser uses for the terminal. */
    get terminalUrl() {
      return process.env.LAB_TERMINAL_URL ?? "ws://localhost:3001";
    },
    /** Name of the provider new sessions run on: "local-docker" in Phase 2. */
    get provider() {
      return process.env.LAB_PROVIDER_NAME ?? "local-docker";
    },
    get monthlyMinutes() {
      return Number(process.env.LAB_MONTHLY_MINUTES ?? 600);
    },
    /** Concurrent sessions across all learners: local Docker capacity now, the cloud spending cap later. */
    get maxActiveSessions() {
      return Number(process.env.LAB_MAX_ACTIVE_SESSIONS ?? 3);
    },
    get enabled() {
      return Boolean(process.env.LAB_CONTROLLER_SECRET && process.env.LAB_TOKEN_SECRET);
    },
  },
};
