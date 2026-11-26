import { remindersSecret } from "./lib/cron-secret";

/**
 * The study reminder scheduler: every REMINDERS_INTERVAL_MINUTES (default 10, 0 turns it off) the server asks
 * itself to send the reminder emails that are due (POST /api/reminders/run). Going through the route keeps the
 * work in the normal server code; in the cloud an outside scheduler can call the same route with REMINDERS_SECRET.
 * Sends are recorded before they go out, so overlapping runs or several instances never send twice.
 */
const minutes = Number(process.env.REMINDERS_INTERVAL_MINUTES ?? 10);

if (minutes > 0 && process.env.NEXT_PHASE !== "phase-production-build") {
  const port = process.env.PORT ?? "3000";
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

/**
 * Lesson video narration: shortly after start, synthesise the narration of published lesson videos that is not
 * cached yet (POST /api/narration/prewarm), so learners rarely wait for the narrator. Only with NARRATOR_URL set.
 */
if (process.env.NARRATOR_URL && process.env.NEXT_PHASE !== "phase-production-build") {
  const port = process.env.PORT ?? "3000";
  const prewarm = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/narration/prewarm`, {
        method: "POST",
        headers: { authorization: `Bearer ${remindersSecret()}` },
        signal: AbortSignal.timeout(60 * 60_000),
      });
      if (res.ok) console.log("[narration] prewarm:", JSON.stringify(await res.json()));
      else console.error(`[narration] prewarm returned ${res.status}`);
    } catch (error) {
      console.error("[narration] prewarm failed:", error instanceof Error ? error.message : error);
    }
  };
  setTimeout(prewarm, 20_000).unref();
}
