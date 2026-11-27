import Link from "next/link";
import type { NextStep } from "@/lib/next-step";
import { pct } from "@/lib/readiness";
import { competencyPath } from "@/server/catalog";
import { buttonVariants } from "./ui/button";

function reason(domain: { name: string; weight: number; answers: number; mastery: number }, cert: string) {
  const share = `${domain.name} is ${domain.weight}% of ${cert}`;
  return domain.answers === 0
    ? `${share}, and you have not practised it yet.`
    : `${share}, and your weakest heavy domain at ${pct(domain.mastery)}% mastery.`;
}

/** One recommended action with its reason. */
export function NextStepCard({ step }: { step: NextStep }) {
  if (step.kind === "pick-focus") {
    return (
      <section aria-labelledby="next-step" className="flex flex-col gap-3 rounded-lg border-2 border-primary bg-card p-6">
        <p id="next-step" className="text-xs font-semibold uppercase tracking-wider text-primary">
          Next step
        </p>
        <h2 className="text-[22px] font-semibold">Pick a cert to focus on</h2>
        <p className="text-[15px] text-muted-foreground">Your next steps follow the cert you focus on. You can change it any time.</p>
        <div>
          <Link href="/certs" className={buttonVariants()}>
            Choose a focus cert
          </Link>
        </div>
      </section>
    );
  }
  if (step.kind === "thin-content") {
    return (
      <section aria-labelledby="next-step" className="flex flex-col gap-3 rounded-lg border-2 border-primary bg-card p-6">
        <p id="next-step" className="text-xs font-semibold uppercase tracking-wider text-primary">
          Next step
        </p>
        <h2 className="text-[22px] font-semibold">Explore the {step.cert} curriculum</h2>
        <p className="text-[15px] text-muted-foreground">
          Lessons and questions for {step.cert} are still coming. Read the official competencies and their linked docs meanwhile.
        </p>
        <div>
          <Link href={`/certs/${step.cert.toLowerCase()}`} className={buttonVariants()}>
            Open {step.cert}
          </Link>
        </div>
      </section>
    );
  }
  const cert = step.cert;
  return (
    <section aria-labelledby="next-step" className="flex flex-col gap-3 rounded-lg border-2 border-primary bg-card p-6">
      <p id="next-step" className="text-xs font-semibold uppercase tracking-wider text-primary">
        Next step
      </p>
      <h2 className="text-[22px] font-semibold">
        {step.kind === "lesson" ? step.lesson.title : `Practise ${step.domain.name}`}
      </h2>
      <p className="text-[15px] text-muted-foreground">
        {cert} · {step.domain.name}. {reason(step.domain, cert)}
      </p>
      <div className="mt-1 flex flex-wrap gap-3">
        {step.kind === "lesson" ? (
          <>
            <Link href={competencyPath(step.competency.ref)} className={buttonVariants()}>
              Start lesson · {step.lesson.minutes} min
            </Link>
            <Link href={`/practice?cert=${cert}&domains=${step.domain.key}`} className={buttonVariants({ variant: "outline" })}>
              Practise 5 questions
            </Link>
          </>
        ) : (
          <Link href={`/practice?cert=${cert}&domains=${step.domain.key}`} className={buttonVariants()}>
            Practise {Math.min(5, step.questions)} questions
          </Link>
        )}
      </div>
    </section>
  );
}
