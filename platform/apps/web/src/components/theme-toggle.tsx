"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useId, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };
const ICON = { system: Monitor, light: Sun, dark: Moon };
const KEY = "theme";
const EVENT = "lfct-theme";

function read(): Theme {
  try {
    const saved = localStorage.getItem(KEY) as Theme | null;
    return saved && ORDER.includes(saved) ? saved : "system";
  } catch {
    return "system"; // storage blocked: follow the system
  }
}

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore: the choice lasts until reload */
  }
  apply(theme);
  window.dispatchEvent(new Event(EVENT));
}

/** Other tabs (storage), this tab (custom event) and the system setting all update every theme control. */
function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (read() === "system") apply("system");
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== null) return;
    apply(read());
    onChange();
  };
  mq.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onChange);
  return () => {
    mq.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onChange);
  };
}

/** The saved choice: "system" (the default, follows the device), "light" or "dark". Remembered on this device. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "system");
}

/** Header button: cycles System, Light, Dark. */
export function ThemeToggle({ className, showLabel = true }: { className?: string; showLabel?: boolean }) {
  const theme = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
  const Icon = ICON[theme];
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={cn("inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md px-2.5 text-sm text-foreground hover:bg-muted", className)}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[theme]}`}
    >
      <Icon aria-hidden="true" className="size-4" />
      {showLabel ? <span className="hidden xl:inline">{LABEL[theme]}</span> : null}
    </button>
  );
}

/** Account page and the mobile menu: the three choices as a radio group. */
export function ThemeChoice({ className }: { className?: string }) {
  const theme = useTheme();
  const name = useId();
  return (
    <fieldset className={cn("flex flex-col gap-2", className)}>
      <legend className="mb-2 text-sm font-medium">Theme</legend>
      <div className="grid grid-cols-3 gap-2">
        {ORDER.map((t) => {
          const Icon = ICON[t];
          return (
            <label
              key={t}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                theme === t ? "border-primary bg-primary-soft font-semibold text-primary" : "bg-card text-foreground hover:bg-muted",
              )}
            >
              <input type="radio" name={name} value={t} checked={theme === t} onChange={() => setTheme(t)} className="sr-only" />
              <Icon aria-hidden="true" className="size-4" />
              {LABEL[t]}
            </label>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">System follows your device&apos;s light or dark setting. The lab terminal and code blocks stay dark.</p>
    </fieldset>
  );
}
