"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Follows the system setting by default; a manual choice wins and is remembered on this device. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme") as Theme | null;
      if (saved && ORDER.includes(saved)) setTheme(saved);
    } catch {
      /* storage blocked: stay on system */
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let current: string | null = null;
      try {
        current = localStorage.getItem("theme");
      } catch {
        /* ignore */
      }
      if (!current || current === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next);
        try {
          localStorage.setItem("theme", next);
        } catch {
          /* ignore */
        }
        apply(next);
      }}
      className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm text-foreground hover:bg-muted"
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}`}
    >
      <Icon aria-hidden="true" className="size-4" />
      <span className="hidden sm:inline">{LABEL[theme]}</span>
    </button>
  );
}
