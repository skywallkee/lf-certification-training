import { start } from "./app.ts";

const stop = await start();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`${signal}: stopping. Running labs keep running; the sweeper removes them when they expire.`);
    void stop().finally(() => process.exit(0));
  });
}
