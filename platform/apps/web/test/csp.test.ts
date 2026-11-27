import { describe, expect, it } from "vitest";
import { docsSources, docsViewerUrl } from "@lfct/labs/docs";
import { buildCsp } from "@/lib/csp";

describe("content security policy", () => {
  it("allows the nonce, the terminal socket and the docs viewer frames", () => {
    const csp = buildCsp({ nonce: "abc", dev: false, terminalUrl: "ws://localhost:4001", docsUrl: "http://{host}.localhost:4001", github: false });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self' ws://localhost:4001");
    expect(csp).toContain("frame-src http://*.localhost:4001");
    expect(csp).toContain("form-action 'self';");
    expect(csp).toContain("object-src 'none'");
  });

  it("adds github.com to form-action only when GitHub sign-in is on", () => {
    expect(buildCsp({ nonce: "n", dev: false, github: true })).toContain("form-action 'self' https://github.com");
  });

  it("turns the docs URL template into a wildcard source", () => {
    expect(docsSources("https://{host}.docs.example.com", ["kubernetes.io"])).toEqual(["https://*.docs.example.com"]);
    expect(docsSources(undefined, ["kubernetes.io"])).toEqual([]);
  });

  it("frames one origin per docs site when each site has its own URL (self-hosted over Tailscale)", () => {
    const docsUrl = "kubernetes.io=https://box.tail1.ts.net:8444, helm.sh=https://box.tail1.ts.net:8445/";
    const hosts = ["kubernetes.io", "helm.sh"];
    expect(docsSources(docsUrl, hosts)).toEqual(["https://box.tail1.ts.net:8444", "https://box.tail1.ts.net:8445"]);
    expect(buildCsp({ nonce: "n", dev: false, docsUrl, docsHosts: hosts, github: false })).toContain(
      "frame-src https://box.tail1.ts.net:8444 https://box.tail1.ts.net:8445;",
    );
    expect(docsViewerUrl("https://helm.sh/docs/intro/?q=1#x", docsUrl, hosts)).toBe("https://box.tail1.ts.net:8445/docs/intro/?q=1#x");
    expect(docsViewerUrl("https://kubernetes.io/docs/", "helm.sh=https://box:8445", hosts)).toBeNull();
  });
});
