import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { en } from "@/messages/en";

/**
 * Every page reads the database or the session, so nothing is prerendered at build time. This also lets the
 * container image be built without DATABASE_URL or auth secrets.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: en.appName, template: `%s · ${en.appName}` },
  description: "Free study cockpit for the 17 Golden Kubestronaut certifications.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

/** Applies the saved theme (or the system setting) before first paint, so there is no flash. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
