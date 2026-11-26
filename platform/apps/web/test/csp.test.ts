import { describe, expect, it } from "vitest";
import { buildCsp, docsSource } from "@/lib/csp";

describe("content security policy", () => {
  it("allows the nonce, the terminal socket and the docs viewer frames", () => {
    const csp = buildCsp({ nonce: "abc", dev: false, terminalUrl: "ws://localhost:3001", docsUrl: "http://{host}.localhost:3001", github: false });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self' ws://localhost:3001");
    expect(csp).toContain("frame-src http://*.localhost:3001");
    expect(csp).toContain("form-action 'self';");
    expect(csp).toContain("object-src 'none'");
  });

  it("adds github.com to form-action only when GitHub sign-in is on", () => {
    expect(buildCsp({ nonce: "n", dev: false, github: true })).toContain("form-action 'self' https://github.com");
  });

  it("turns the docs URL template into a wildcard source", () => {
    expect(docsSource("https://{host}.docs.example.com")).toBe("https://*.docs.example.com");
    expect(docsSource(undefined)).toBeNull();
  });
});
