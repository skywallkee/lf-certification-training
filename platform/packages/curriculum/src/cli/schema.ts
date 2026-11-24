import { writeFile } from "node:fs/promises";
import path from "node:path";
import * as z from "zod";
import { DEFAULT_CONTENT_DIR } from "../load.ts";
import { CertificationSchema, ProgramsFileSchema } from "../schema.ts";

/** Writes JSON Schemas next to the YAML so editors validate while you type. CI checks they are current. */
const outDir = path.join(DEFAULT_CONTENT_DIR, "curriculum/schema");
const targets = [
  ["certification.schema.json", CertificationSchema, "Certification curriculum"],
  ["programs.schema.json", ProgramsFileSchema, "Certification programs"],
] as const;
for (const [file, schema, title] of targets) {
  const json = { title, ...z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) };
  await writeFile(path.join(outDir, file), `${JSON.stringify(json, null, 2)}\n`);
  console.log(`wrote content/curriculum/schema/${file}`);
}
