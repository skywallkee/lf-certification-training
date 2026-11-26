/**
 * Runs once when the server starts. In the Node.js runtime it starts the study reminder scheduler (see
 * instrumentation-node.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
