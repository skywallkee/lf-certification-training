import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { BOOT_STEPS } from "@lfct/labs/status";

/** Boot steps with their state; the task text stays readable next to it. */
export function BootProgress({ step, message, failed, elapsedSeconds }: { step: number; message: string | null; failed: boolean; elapsedSeconds: number }) {
  return (
    <section aria-labelledby="boot" className="flex flex-1 flex-col justify-center rounded-lg border bg-card p-6">
      <h2 id="boot" className="text-lg font-semibold">
        {failed ? "This lab could not start" : "Starting your cluster"}
      </h2>
      <p className="mt-1 text-[15px] text-muted-foreground">
        {failed ? message : `This usually takes about a minute on local Docker; read the task while you wait. ${elapsedSeconds} s so far.`}
      </p>
      <ol className="mt-5 flex flex-col gap-3" aria-live="polite">
        {BOOT_STEPS.map((s, i) => {
          const state = failed && i === step ? "failed" : i < step ? "done" : i === step && !failed ? "running" : "pending";
          return (
            <li key={s.key} className="flex items-center gap-3 text-[15px]">
              {state === "done" ? (
                <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
              ) : state === "running" ? (
                <Loader2 aria-hidden="true" className="size-5 animate-spin text-primary motion-reduce:animate-none" />
              ) : state === "failed" ? (
                <XCircle aria-hidden="true" className="size-5 text-destructive" />
              ) : (
                <Circle aria-hidden="true" className="size-5 text-muted-foreground" />
              )}
              <span className={state === "pending" ? "text-muted-foreground" : ""}>
                {s.label}
                <span className="sr-only"> ({state})</span>
              </span>
            </li>
          );
        })}
      </ol>
      {!failed && message ? <p className="mt-4 text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}
