import type { ReactNode } from "react";

/** Focused screens (quiz, onboarding) bring their own slim header and no sidebar. */
export default function FocusLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-col">{children}</div>;
}
