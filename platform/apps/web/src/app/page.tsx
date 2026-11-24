import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { PATH_GROUPS } from "@/lib/path";
import { en } from "@/messages/en";
import { getCatalog } from "@/server/catalog";
import { getUser } from "@/server/session";

export default async function HomePage() {
  if (await getUser()) redirect("/today");
  const catalog = await getCatalog();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-3 sm:px-8">
        <span className="font-bold">{en.appName}</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {en.nav.signIn}
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-12 px-4 py-12 sm:px-8">
        <section className="flex max-w-2xl flex-col gap-5">
          <h1 className="text-4xl font-bold">{en.home.title}</h1>
          <p className="text-lg text-muted-foreground">{en.home.lead}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/sign-up" className={buttonVariants()}>
              {en.home.start}
            </Link>
            <Link href="/certs" className={buttonVariants({ variant: "outline" })}>
              {en.home.browse}
            </Link>
          </div>
        </section>
        <section aria-labelledby="path-title" className="flex flex-col gap-5">
          <h2 id="path-title" className="text-xl font-semibold">
            The path to all {catalog.certs.size}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PATH_GROUPS.map((g) => (
              <div key={g.key} className="rounded-lg border bg-card p-5">
                <h3 className="text-sm font-semibold text-muted-foreground">{g.name}</h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {g.certs.map((code) => {
                    const cert = catalog.certs.get(code);
                    return (
                      <li key={code}>
                        <Link
                          href={`/certs/${code.toLowerCase()}`}
                          className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-semibold text-foreground no-underline hover:bg-muted hover:text-foreground"
                          title={cert?.name}
                        >
                          {code}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Curricula are transcribed from the public CNCF and Linux Foundation pages. Lessons and quizzes are a small {en.sampleLabel.toLowerCase()} set
            while the app is built.
          </p>
        </section>
      </main>
    </div>
  );
}
