import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GithubButton } from "@/components/forms/github-button";
import { SignInForm } from "@/components/forms/auth-forms";
import { env } from "@/env";
import { getUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams;
  const next = rawNext?.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/today";
  if (await getUser()) redirect(next);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">Pick up where you left off. Free, no card, ever.</p>
      </div>
      {env.githubEnabled ? (
        <>
          <GithubButton next={next} />
          <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}
      <SignInForm next={next} />
    </div>
  );
}
