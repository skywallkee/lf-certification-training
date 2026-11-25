import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GithubButton } from "@/components/forms/github-button";
import { SignUpForm } from "@/components/forms/auth-forms";
import { env } from "@/env";
import { getUser } from "@/server/session";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage() {
  if (await getUser()) redirect("/today");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Lessons and the curriculum are open to everyone. An account saves your progress, quizzes and review queue.
        </p>
      </div>
      {env.githubEnabled ? <GithubButton next="/onboarding" /> : null}
      <SignUpForm />
    </div>
  );
}
