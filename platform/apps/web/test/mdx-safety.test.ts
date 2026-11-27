import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mdxProblems } from "../src/lib/mdx-safety";

describe("lesson MDX written in the admin editor", () => {
  it("accepts Markdown and the lesson components with literal props", () => {
    expect(
      mdxProblems(
        '## Title\n\nText with `code` and a [link](https://kubernetes.io).\n\n<Callout kind="tip" title="Remember">Use `-A`.</Callout>\n\n<Flow label="Path" steps={["Pod", "Service", `Node`]} />\n\n| a | b |\n|---|---|\n| 1 | 2 |\n',
      ),
    ).toEqual([]);
  });

  it("accepts the rich lesson components", () => {
    expect(
      mdxProblems(
        '<KeyIdea>One idea.</KeyIdea>\n\n<DeepDive title="Under it">Details.</DeepDive>\n\n<Example title="Do it">\n\n```bash\nkubectl get svc\n```\n\n</Example>\n\n<Trick title="Fast">Use `-o yaml`.</Trick>\n\n<Diagram id="flow" />\n',
      ),
    ).toEqual([]);
  });

  it("accepts every lesson body in the repository", async () => {
    const dir = path.resolve(import.meta.dirname, "../../../../content/lessons");
    const files = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith(".mdx"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(path.join(dir, file), "utf8");
      expect(mdxProblems(text.replace(/^---[\s\S]*?---\n/, "")), file).toEqual([]);
    }
  });

  it("rejects code: imports, expressions, other tags, handlers and computed props", () => {
    const one = (src: string) => mdxProblems(src).join("\n");
    expect(one('import fs from "node:fs"\n\nHi')).toContain("import and export are not allowed");
    expect(one("Total: {process.env.SECRET}")).toContain("{expressions} are not allowed");
    expect(one("<script>alert(1)</script>")).toContain("<script> is not allowed");
    expect(one('<div onClick={() => 1}>x</div>')).toContain("<div> is not allowed");
    expect(one("<Flow label=\"x\" steps={globalThis.steps} />")).toContain("may only hold plain values");
    expect(one("<Flow label=\"x\" steps={[`${1}`]} />")).toContain("may only hold plain values");
    expect(one("<Callout {...props}>x</Callout>")).toContain("spread props are not allowed");
  });
});
