import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server.ts";

function parse(result: Awaited<ReturnType<Client["callTool"]>>): any {
  const first = (result.content as { type: string; text?: string }[])[0];
  return JSON.parse(first?.text ?? "null");
}

describe("curriculum MCP server", () => {
  const client = new Client({ name: "test", version: "1.0.0" });
  beforeAll(async () => {
    const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
    await createServer().connect(serverEnd);
    await client.connect(clientEnd);
  });
  afterAll(async () => client.close());

  it("exposes the read-only tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "coverage_gaps", "get_competency", "get_objectives", "list_certs", "search_competencies",
    ]);
  });

  it("lists the six performance exams", async () => {
    const certs = parse(await client.callTool({ name: "list_certs", arguments: { examStyle: "performance" } }));
    expect(certs.map((c: { code: string }) => c.code).sort()).toEqual(["CKA", "CKAD", "CKNE", "CKS", "CNPE", "LFCS"]);
  });

  it("returns objectives with weights that sum to 100", async () => {
    const cka = parse(await client.callTool({ name: "get_objectives", arguments: { cert: "cka" } }));
    expect(cka.code).toBe("CKA");
    expect(cka.domains.reduce((n: number, d: { weight: number }) => n + d.weight, 0)).toBe(100);
    expect(cka.source).toMatch(/^https:\/\/github\.com\/cncf\/curriculum\/blob\/[0-9a-f]{40}\//);
  });

  it("reports every competency as a gap while there is no content", async () => {
    const gaps = parse(await client.callTool({ name: "coverage_gaps", arguments: { cert: "KCNA" } }));
    expect(gaps.gaps).toBe(13);
    expect(gaps.items[0].domainWeight).toBe(44);
  });

  it("returns a tool error for an unknown competency", async () => {
    const result = await client.callTool({ name: "get_competency", arguments: { id: "cka/storage/nope" } });
    expect(result.isError).toBe(true);
  });
});
