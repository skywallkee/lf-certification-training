/**
 * Where the learner was in a running lab or mock exam, saved on the server so a page refresh, a closed tab or
 * another browser picks up at the same exercise with the same flags and panel.
 */
export interface PlayerState {
  /** Index of the exercise or task on screen. */
  current: number;
  /** Ids of the flagged exercises or tasks. */
  flags: string[];
  /** The left panel's tab. */
  tab: "tasks" | "docs";
  /** Index of the documentation page picked in the docs tab. */
  doc: number;
}

export const EMPTY_PLAYER_STATE: PlayerState = { current: 0, flags: [], tab: "tasks", doc: 0 };

/** Cleans untrusted input (a request body, an old row) against the lab's task ids; never throws. */
export function parsePlayerState(raw: unknown, taskIds: readonly string[]): PlayerState {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const index = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < max ? v : 0);
  const flags = Array.isArray(o.flags) ? [...new Set(o.flags.filter((f): f is string => typeof f === "string" && taskIds.includes(f)))] : [];
  return {
    current: index(o.current, Math.max(1, taskIds.length)),
    flags,
    tab: o.tab === "docs" ? "docs" : "tasks",
    doc: index(o.doc, 50),
  };
}
