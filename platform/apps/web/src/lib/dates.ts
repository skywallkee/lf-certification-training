/** Calendar dates as ISO strings (YYYY-MM-DD). All arithmetic is in UTC on the date alone. */

export type IsoDate = string;

/** Today's date in a time zone, falling back to UTC for an unknown zone. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The calendar date of an instant in a time zone. */
export function dateIn(timeZone: string, instant: Date): IsoDate {
  return todayIn(timeZone, instant);
}

function toUtc(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Adds calendar months, clamping to the month's last day (31 Jan + 1 month = 28 or 29 Feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = toUtc(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

const LONG = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "3 January 2027" */
export function formatLong(date: IsoDate): string {
  return LONG.format(toUtc(date));
}

/** "3 Jan 2027" */
export function formatShort(date: IsoDate): string {
  return SHORT.format(toUtc(date));
}

/** "Tuesday 24 November" */
export function formatWeekday(date: IsoDate): string {
  return WEEKDAY.format(toUtc(date)).replace(",", "");
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUtc(value).getTime()) && toUtc(value).toISOString().startsWith(value);
}
