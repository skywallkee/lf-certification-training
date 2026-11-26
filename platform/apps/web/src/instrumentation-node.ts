import { remindersSecret } from "./lib/cron-secret";

/**
 * The study reminder scheduler: every REMINDERS_INTERVAL_MINUTES (default 10, 0 turns it off) the server asks
 * itself to send the reminder emails that are due (POST /api/reminders/run). Going through the route keeps the
 * work in the normal server code; in the cloud an outside scheduler can call the same route with REMINDERS_SECRET.
 * Sends are recorded before they go out, so overlapping runs or several instances never send twice.
 */
const minutes = Number(process.env.REMINDERS_INTERVAL_MINUTES ?? 10);

if (minutes > 0 && process.env.NEXT_PHASE !== "phase-production-build") {
  const port = process.env.PORT ?? "4000";
  const run = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/reminders/run`, {
        method: "POST",
        headers: { authorization: `Bearer ${remindersSecret()}` },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) console.error(`[reminders] run returned ${res.status}`);
    } catch (error) {
      console.error("[reminders] run failed:", error instanceof Error ? error.message : error);
    }
  };
  // First run shortly after start, once the server is listening.
  setTimeout(run, 30_000).unref();
  setInterval(run, minutes * 60_000).unref();
}
