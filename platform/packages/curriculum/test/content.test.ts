import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContentError, loadContent, loadCurriculum, type Curriculum } from "../src/index.ts";

describe("content in the repository", () => {
  let curriculum: Curriculum;
  beforeAll(async () => {
    curriculum = await loadCurriculum();
  });

  it("loads the sample set: 12 lessons and 60 questions across KCNA, CKA and CKNE, all marked mock", async () => {
    const content = await loadContent(curriculum);
    expect(content.lessons).toHaveLength(12);
    expect(content.questions).toHaveLength(60);
    expect(new Set([...content.lessons, ...content.questions].map((i) => i.cert))).toEqual(new Set(["KCNA", "CKA", "CKNE"]));
    expect([...content.lessons, ...content.questions].every((i) => i.mock)).toBe(true);
  });

  it("leaves the sample set out when includeSample is false", async () => {
    const content = await loadContent(curriculum, { includeSample: false });
    expect(content).toEqual({ lessons: [], questions: [] });
  });

  it("keeps exactly one deliberately broken question, with a known issue and no correct option", async () => {
    const { questions } = await loadContent(curriculum);
    const broken = questions.filter((q) => q.knownIssue);
    expect(broken.map((q) => q.id)).toEqual(["sample-cka-022"]);
    expect(broken[0]!.options.some((o) => o.correct)).toBe(false);
  });
});

describe("content validation", () => {
  let dir: string;
  let curriculum: Curriculum;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lfct-content-"));
    curriculum = { ...(await loadCurriculum()), contentDir: dir };
  });
  afterAll(async () => rm(dir, { recursive: true, force: true }));

  async function put(rel: string, text: string) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), text);
  }

  it("reports every problem at once", async () => {
    await put(
      "lessons/real/unknown-ref.mdx",
      ["---", "id: unknown-ref", "title: T", "summary: S", "minutes: 5", "competencies:", "  - cka/storage/not-a-competency", "---", "Body"].join("\n"),
    );
    await put(
      "lessons/real/mock-outside-sample.mdx",
      ["---", "id: mock-outside", "title: T", "summary: S", "minutes: 5", "mock: true", "competencies:", "  - cka/storage/implement-storage-classes-dynamic-volume", "---", "Body"].join("\n"),
    );
    await put("lessons/real/no-front-matter.mdx", "Just a body");
    await put(
      "questions/real/bank.yaml",
      [
        "questions:",
        "  - id: two-right",
        "    kind: single",
        "    competencies: [cka/storage/implement-storage-classes-dynamic-volume]",
        "    stem: Pick one",
        "    options: [{ id: a, text: A, correct: true }, { id: b, text: B, correct: true }]",
        "    explanation: Because",
        "    source: { title: Docs, url: https://kubernetes.io/docs/ }",
        "  - id: two-right",
        "    kind: multiple",
        "    competencies: [cka/storage/implement-storage-classes-dynamic-volume]",
        "    stem: Pick some",
        "    options: [{ id: a, text: A, correct: true }, { id: b, text: B, correct: true }]",
        "    explanation: Because",
        "    source: { title: Docs, url: http://insecure.example.com }",
      ].join("\n"),
    );

    const err = await loadContent(curriculum).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContentError);
    const problems = (err as ContentError).problems.join("\n");
    expect(problems).toContain('unknown competency "cka/storage/not-a-competency"');
    expect(problems).toContain("mock lessons belong under a sample/ folder");
    expect(problems).toContain("missing YAML front matter");
    expect(problems).toContain("single-answer question needs exactly 1 correct option, has 2");
    expect(problems).toContain("must be an https URL");
  });
});
