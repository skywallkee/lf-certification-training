import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { en } from "@/messages/en";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-3 sm:px-8">
        <Link href="/" className="font-bold text-foreground no-underline hover:text-foreground">
          {en.appName}
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
