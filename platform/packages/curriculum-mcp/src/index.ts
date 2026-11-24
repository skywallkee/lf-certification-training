#!/usr/bin/env -S npx tsx
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.ts";

// stdout carries the protocol; log to stderr only.
const server = createServer({ ...(process.env.LFCT_CONTENT_DIR ? { contentDir: process.env.LFCT_CONTENT_DIR } : {}) });
await server.connect(new StdioServerTransport());
console.error("lfct-curriculum MCP server running on stdio");
