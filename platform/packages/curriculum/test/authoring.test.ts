import { mkdir, mkdtemp, readdir, rm, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  exportPath,
  itemFromSource,
  itemToSource,
  loadContent,
  loadCurriculum,
  validateItem,
  validateLab,
  validateLesson,
  validateQuestion,
  type AuthoringContext,
  type Content,
  type Curriculum,
  type ItemType,
} from "../src/index.ts";

/** Editor JSON for a loaded item: the file fields without the loader's own (cert, file, hash, kind). */
function editOf(type: ItemType, item: Record<string, unknown>): Record<string, unknown> {
  const { cert, file: _f, hash: _h, ...rest } = item;
  if (type === "lab" || type === "mock") delete rest.kind;
  // A multiple-choice mock names its cert in the file; the others take it from their first competency.
  return type === "quiz-mock" ? { ...rest, cert } : rest;
}

describe("authoring: editor JSON, validation and file export", () => {
  let curriculum: Curriculum;
  let content: Content;
  let ctx: AuthoringContext;
  beforeAll(async () => {
    curriculum = await loadCurriculum();
    content = await loadContent(curriculum);
    ctx = { competencies: new Set(curriculum.competencies.keys()), certs: curriculum.certs };
  });

  it("accepts every sample item and round-trips it through its file format", () => {
    const items: [ItemType, Record<string, unknown>][] = [
      ...content.lessons.map((l) => ["lesson", l] as unknown as [ItemType, Record<string, unknown>]),
      ...content.questions.map((q) => ["question", q] as unknown as [ItemType, Record<string, unknown>]),
      ...content.labs.map((l) => [l.kind, l] as unknown as [ItemType, Record<string, unknown>]),
      ...content.quizMocks.map((m) => ["quiz-mock", m] as unknown as [ItemType, Record<string, unknown>]),
    ];
    expect(items.length).toBeGreaterThan(70);
    for (const [type, item] of items) {
      const edit = editOf(type, item);
      const checked = validateItem(type, edit, ctx);
      expect(checked, `${type} ${String(item.id)}`).toMatchObject({ ok: true });
      const again = validateItem(type, itemFromSource(type, itemToSource(type, edit)), ctx);
      expect(again.ok && again.value, `${type} ${String(item.id)}`).toEqual(checked.ok && checked.value);
    }
  });

  it("reports schema problems and unknown competencies by path", () => {
    const lesson = editOf("lesson", content.lessons[0] as unknown as Record<string, unknown>);
    expect(validateLesson({ ...lesson, title: "", competencies: ["cka/nope/nothing"] }, ctx)).toEqual({
      ok: false,
      problems: [expect.stringContaining("title:")],
    });
    expect(validateLesson({ ...lesson, competencies: ["cka/nope/nothing"] }, ctx)).toEqual({
      ok: false,
      problems: ['competencies: unknown competency "cka/nope/nothing"'],
    });
    const q = editOf("question", content.questions[1] as unknown as Record<string, unknown>);
    const options = (q.options as { id: string; text: string; correct: boolean }[]).map((o) => ({ ...o, correct: false }));
    const bad = validateQuestion({ ...q, kind: "single", options }, ctx);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.problems.join()).toContain("exactly 1 correct option");
  });

  it("only accepts multiple-choice mocks for multiple-choice certs", () => {
    const m = editOf("quiz-mock", content.quizMocks[0] as unknown as Record<string, unknown>);
    expect(validateItem("quiz-mock", { ...m, cert: "CKA" }, ctx)).toEqual({ ok: false, problems: ["cert: CKA is a hands-on exam; write a practical mock exam for it instead"] });
    expect(validateItem("quiz-mock", { ...m, cert: "NOPE" }, ctx)).toEqual({ ok: false, problems: ['cert: unknown cert "NOPE"'] });
    expect(itemToSource("quiz-mock", m).startsWith("format: multiple-choice\n")).toBe(true);
    expect(exportPath("quiz-mock", m as never)).toBe("content/mocks/sample/kcna/sample-kcna-mock-full.yaml");
  });

  it("applies the mock exam rules only to mock exams", () => {
    const lab = editOf("lab", content.labs.find((l) => l.kind === "lab") as unknown as Record<string, unknown>);
    expect(validateLab(lab, "lab", ctx).ok).toBe(true);
    const asMock = validateLab(lab, "mock", ctx);
    expect(!asMock.ok && asMock.problems.join("\n")).toContain("passPercent: required for a mock exam");
    expect(validateLab({ ...lab, passPercent: 66 }, "lab", ctx)).toEqual({ ok: false, problems: ["passPercent: only mock exams have a pass mark"] });
  });

  it("exports files the content loader accepts at the suggested path", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lfct-authoring-"));
    try {
      await cp(path.join(curriculum.contentDir, "curriculum"), path.join(dir, "curriculum"), { recursive: true });
      const lesson = { ...editOf("lesson", content.lessons[0] as unknown as Record<string, unknown>), id: "exported-lesson" };
      const question = { ...editOf("question", content.questions[0] as unknown as Record<string, unknown>), id: "exported-question" };
      const mockLab = content.labs.find((l) => l.kind === "mock")!;
      const mock = { ...editOf("mock", mockLab as unknown as Record<string, unknown>), id: "exported-mock" };
      const quizMock = { ...editOf("quiz-mock", content.quizMocks[0] as unknown as Record<string, unknown>), id: "exported-quiz-mock" };
      for (const [type, item] of [["lesson", lesson], ["question", question], ["mock", mock], ["quiz-mock", quizMock]] as [ItemType, Record<string, unknown> & { id: string; mock: boolean; competencies: string[] }][]) {
        const file = path.join(dir, exportPath(type, item).replace(/^content\//, ""));
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, itemToSource(type, item));
      }
      const loaded = await loadContent(await loadCurriculum(dir));
      expect(loaded.lessons.map((l) => l.id)).toEqual(["exported-lesson"]);
      expect(loaded.questions.map((q) => q.id)).toEqual(["exported-question"]);
      expect(loaded.labs.map((l) => [l.id, l.kind])).toEqual([["exported-mock", "mock"]]);
      expect(loaded.quizMocks.map((m) => [m.id, m.cert])).toEqual([["exported-quiz-mock", "KCNA"]]);
      expect(await readdir(path.join(dir, "questions", "sample"))).toEqual([expect.stringMatching(/^[a-z]+-exported-question\.yaml$/)]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
