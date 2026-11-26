import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { hit, isBlocked, clear, resetRateLimits } = await import("@/server/rate-limit");

const limit = { max: 3, windowMs: 1000 };

describe("rate limiter", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to max attempts per window, then blocks", () => {
    expect([hit("a", limit, 0), hit("a", limit, 1), hit("a", limit, 2)]).toEqual([true, true, true]);
    expect(isBlocked("a", limit, 3)).toBe(true);
    expect(hit("a", limit, 3)).toBe(false);
    expect(isBlocked("b", limit, 3)).toBe(false);
  });

  it("opens again when the window resets or the key is cleared", () => {
    for (let i = 0; i < 3; i++) hit("a", limit, 0);
    expect(isBlocked("a", limit, 999)).toBe(true);
    expect(isBlocked("a", limit, 1000)).toBe(false);
    expect(hit("a", limit, 1000)).toBe(true);
    for (let i = 0; i < 3; i++) hit("a", limit, 1000);
    clear("a");
    expect(isBlocked("a", limit, 1001)).toBe(false);
  });
});
