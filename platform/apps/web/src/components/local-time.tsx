"use client";

import { useEffect, useState } from "react";

const fmt = (d: Date, timeZone?: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", ...(timeZone ? { timeZone } : {}) }).format(d);

/** A date and time in the reader's own time zone (UTC on the server, swapped after hydration). */
export function LocalTime({ value }: { value: Date | string }) {
  const d = typeof value === "string" ? new Date(value) : value;
  const [text, setText] = useState(() => `${fmt(d, "UTC")} UTC`);
  const ms = d.getTime();
  useEffect(() => setText(fmt(new Date(ms))), [ms]);
  return <time dateTime={d.toISOString()}>{text}</time>;
}
