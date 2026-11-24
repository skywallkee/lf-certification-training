import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { CertificationSchema, DEFAULT_CONTENT_DIR, ProgramsFileSchema } from "../src/index.ts";

describe("generated JSON Schemas", () => {
  it.each([
    ["certification.schema.json", CertificationSchema],
    ["programs.schema.json", ProgramsFileSchema],
  ] as const)("%s is up to date (run pnpm curriculum:schema)", async (file, schema) => {
    const onDisk = JSON.parse(await readFile(path.join(DEFAULT_CONTENT_DIR, "curriculum/schema", file), "utf8"));
    const { title: _title, ...rest } = onDisk;
    expect(rest).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }))));
  });
});
