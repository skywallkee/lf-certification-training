import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDocsProxy } from "../src/docs-proxy.ts";

/** A stand-in for kubernetes.io that forbids framing, like many docs sites. */
let upstream: http.Server;
let proxy: http.Server;
let proxyPort = 0;

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    if (req.url === "/old") {
      res.writeHead(301, { location: "https://kubernetes.io/docs/home/" });
      return res.end();
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY", "set-cookie": "a=b" });
    res.end('<a href="https://kubernetes.io/docs/concepts/">c</a> <a href="https://kubernetes.io.evil.example/">x</a> <a href="https://example.com/">e</a>');
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  const docs = createDocsProxy({
    hosts: ["kubernetes.io"],
    allowedOrigins: ["http://localhost:4000"],
    upstream: () => `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
  });
  proxy = http.createServer((req, res) => {
    const site = docs.siteFor(req);
    if (!site) {
      res.writeHead(404);
      return res.end();
    }
    void docs.handle(req, res, site);
  });
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
  proxyPort = (proxy.address() as AddressInfo).port;
});

afterAll(() => {
  upstream.close();
  proxy.close();
});

function get(path: string, host: string) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: proxyPort, path, headers: { host } }, (res) => {
        let body = "";
        res.on("data", (c: Buffer) => (body += c.toString()));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      })
      .on("error", reject);
  });
}

describe("docs viewer proxy", () => {
  it("refuses request targets that would point the upstream URL at another host", async () => {
    for (const path of ["@evil.example/", "//evil.example/"]) {
      const res = await get(path, `kubernetes.io.localhost:${proxyPort}`);
      expect(res.status, path).toBe(400);
    }
  });

  it("serves an allowlisted site framable only by the web app, with its links kept in the viewer", async () => {
    const res = await get("/docs/home/", `kubernetes.io.localhost:${proxyPort}`);
    expect(res.status).toBe(200);
    expect(res.headers["x-frame-options"]).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.headers["content-security-policy"]).toBe("frame-ancestors http://localhost:4000");
    expect(res.body).toContain(`href="http://kubernetes.io.localhost:${proxyPort}/docs/concepts/"`);
    expect(res.body).toContain('href="https://kubernetes.io.evil.example/"');
    expect(res.body).toContain('href="https://example.com/"');
  });

  it("rewrites redirects to the site into the viewer", async () => {
    const res = await get("/old", `kubernetes.io.localhost:${proxyPort}`);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(`http://kubernetes.io.localhost:${proxyPort}/docs/home/`);
  });

  it("ignores hosts that are not allowlisted", async () => {
    expect((await get("/", `example.com.localhost:${proxyPort}`)).status).toBe(404);
    expect((await get("/", "localhost")).status).toBe(404);
  });
});
