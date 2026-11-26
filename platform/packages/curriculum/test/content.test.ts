import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { ContentError, loadContent, loadCurriculum, mockProblems, type Curriculum, type LabInput } from "../src/index.ts";

describe("content in the repository", () => {
  let curriculum: Curriculum;
  beforeAll(async () => {
    curriculum = await loadCurriculum();
  });

  it("loads the sample set: 12 lessons and 74 questions across KCNA, KCSA, CKA and CKNE, all marked mock", async () => {
    const content = await loadContent(curriculum);
    expect(content.lessons).toHaveLength(12);
    expect(content.questions).toHaveLength(74);
    expect(new Set([...content.lessons, ...content.questions].map((i) => i.cert))).toEqual(new Set(["KCNA", "KCSA", "CKA", "CKNE"]));
    expect([...content.lessons, ...content.questions].every((i) => i.mock)).toBe(true);
  });

  it("leaves the sample set out when includeSample is false", async () => {
    const content = await loadContent(curriculum, { includeSample: false });
    expect(content).toEqual({ lessons: [], questions: [], labs: [], quizMocks: [] });
  });

  it("loads the sample practical mock exams for CKA, CKAD and CKS: a pass mark, a competency per task and no hints", async () => {
    const mocks = (await loadContent(curriculum)).labs.filter((l) => l.kind === "mock");
    expect(mocks.map((m) => [m.id, m.minutes, m.tasks.length, m.passPercent, m.clusters.length])).toEqual([
      ["sample-cka-mock-full", 120, 16, 66, 3],
      ["sample-cka-mock-half", 60, 8, 66, 3],
      ["sample-ckad-mock-full", 120, 11, 66, 2],
      ["sample-cks-mock-full", 120, 12, 67, 2],
    ]);
    for (const m of mocks) {
      const prefix = `${m.cert.toLowerCase()}/`;
      expect(m.tasks.every((t) => t.competency?.startsWith(prefix) && t.hints.length === 0 && t.doc)).toBe(true);
    }
  });

  it("weights the CKAD and CKS mocks like their exam domains", async () => {
    const mocks = (await loadContent(curriculum)).labs.filter((l) => l.id === "sample-ckad-mock-full" || l.id === "sample-cks-mock-full");
    for (const m of mocks) {
      const cert = curriculum.certs.get(m.cert)!;
      const byDomain = new Map<string, number>();
      for (const t of m.tasks) {
        const domain = t.competency!.split("/")[1]!;
        byDomain.set(domain, (byDomain.get(domain) ?? 0) + t.weight);
      }
      expect(Object.fromEntries(byDomain)).toEqual(Object.fromEntries(cert.domains.map((d) => [d.key, d.weight])));
    }
  });

  it("loads the sample multiple-choice mocks for KCNA and KCSA, one with a fixed question list", async () => {
    const { quizMocks } = await loadContent(curriculum);
    expect(quizMocks.map((m) => [m.id, m.cert, m.minutes, m.questionCount, m.passPercent, m.questions?.length ?? null])).toEqual([
      ["sample-kcna-mock-full", "KCNA", 90, 60, 75, null],
      ["sample-kcna-mock-quick", "KCNA", 15, 10, 75, 10],
      ["sample-kcsa-mock-full", "KCSA", 90, 60, 75, null],
    ]);
  });

  it("holds multiple-choice mocks to their rules", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lfct-quiz-mock-"));
    try {
      await cp(path.join(curriculum.contentDir, "curriculum"), path.join(dir, "curriculum"), { recursive: true });
      await mkdir(path.join(dir, "questions"), { recursive: true });
      await writeFile(path.join(dir, "questions", "kcna.yaml"), stringify({ questions: [questionOf("kcna-q1", "kcna/kubernetes-fundamentals/scheduling")] }));
      await mkdir(path.join(dir, "mocks"), { recursive: true });
      const mock = { format: "multiple-choice", id: "m1", title: "T", summary: "S", minutes: 90, questionCount: 2, passPercent: 75 };
      await writeFile(path.join(dir, "mocks", "a.yaml"), stringify({ ...mock, id: "hands-on", cert: "CKA" }));
      await writeFile(path.join(dir, "mocks", "b.yaml"), stringify({ ...mock, id: "listed", cert: "KCNA", questions: ["kcna-q1", "nope"] }));
      await writeFile(path.join(dir, "mocks", "c.yaml"), stringify({ ...mock, id: "too-many", cert: "KCNA", questions: ["kcna-q1"] }));
      const err = await loadContent(await loadCurriculum(dir)).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ContentError);
      expect((err as ContentError).problems).toEqual([
        "mocks/a.yaml: cert: CKA is a hands-on exam; write a practical mock exam for it instead",
        "mocks/c.yaml: questionCount: is more than the 1 listed questions",
        'mocks/b.yaml: questions.1: unknown question "nope"',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("holds mock exams to their extra rules", () => {
    const base = mockBase();
    expect(mockProblems(base)).toEqual([]);
    expect(mockProblems({ ...base, passPercent: undefined })).toContain("passPercent: required for a mock exam");
    expect(mockProblems({ ...base, tasks: base.tasks.map((t, i) => (i === 0 ? { ...t, hints: ["x"], competency: undefined } : t)) })).toEqual([
      "tasks.0.hints: mock exams have no hints, as in the real exam",
      "tasks.0.competency: required in a mock exam (it decides the score per domain)",
    ]);
  });

  it("loads the four sample labs, one of them with three clusters, with weights adding up to 100 and a reference solution", async () => {
    const labs = (await loadContent(curriculum)).labs.filter((l) => l.kind === "lab");
    expect(labs.map((l) => l.cert).sort()).toEqual(["CKA", "CKA", "CKAD", "CKNE"]);
    const multi = labs.find((l) => l.id === "sample-cka-three-clusters")!;
    expect(multi.clusters).toEqual(["c1", "c2", "c3"]);
    expect(multi.tasks.map((t) => t.cluster)).toEqual(["c1", "c2", "c3"]);
    expect(labs.find((l) => l.id === "sample-cka-rbac-pod-reader")!.clusters).toEqual(["k8s"]);
    for (const lab of labs) {
      expect(lab.mock).toBe(true);
      expect(lab.tasks.reduce((n, t) => n + t.weight, 0)).toBe(100);
      expect(lab.solution.length).toBeGreaterThan(0);
    }
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

describe("lab validation", () => {
  let dir: string;
  let curriculum: Curriculum;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lfct-labs-"));
    curriculum = { ...(await loadCurriculum()), contentDir: dir };
  });
  afterAll(async () => rm(dir, { recursive: true, force: true }));

  it("checks weights, check kinds, ids and the sample folder rule", async () => {
    await mkdir(path.join(dir, "labs/real"), { recursive: true });
    await writeFile(
      path.join(dir, "labs/real/bad.yaml"),
      [
        "id: bad-lab",
        "mock: true",
        "title: T",
        "summary: S",
        "tier: 1",
        "minutes: 20",
        "competencies: [cka/cluster-architecture-installation-configuration/manage-role-based-access-control]",
        "solution: echo",
        "tasks:",
        "  - id: a",
        "    title: A",
        "    weight: 60",
        "    body: B",
        "    checks:",
        "      - id: both",
        "        description: D",
        "        script: 'true'",
        "        assert: { kind: Pod }",
        "  - id: b",
        "    title: B",
        "    weight: 30",
        "    body: B",
        "    checks:",
        "      - id: ws-assert",
        "        description: D",
        "        runIn: workstation",
        "        assert: { kind: Pod }",
      ].join("\n"),
    );
    const err = await loadContent(curriculum).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContentError);
    const problems = (err as ContentError).problems.join("\n");
    expect(problems).toContain("task weights must add up to 100, they add up to 90");
    expect(problems).toContain("a check needs exactly one of assert or script");
    expect(problems).toContain("assert checks always run in the grader");
  });

  it("checks cluster names and that every task of a multi-cluster lab names one of them", async () => {
    await rm(path.join(dir, "labs"), { recursive: true, force: true });
    await mkdir(path.join(dir, "labs/sample"), { recursive: true });
    const lab = (clusters: string, firstCluster: string) =>
      [
        "id: multi",
        "mock: true",
        "title: T",
        "summary: S",
        "tier: 1",
        "minutes: 20",
        `clusters: ${clusters}`,
        "competencies: [cka/cluster-architecture-installation-configuration/manage-role-based-access-control]",
        "solution: echo",
        "tasks:",
        "  - id: a",
        "    title: A",
        `    cluster: ${firstCluster}`,
        "    weight: 50",
        "    body: B",
        "    checks: [{ id: x, description: D, script: 'true' }]",
        "  - id: b",
        "    title: B",
        "    weight: 50",
        "    body: B",
        "    checks: [{ id: y, description: D, script: 'true' }]",
      ].join("\n");
    await writeFile(path.join(dir, "labs/sample/multi.yaml"), lab("[c1, c2]", "c9"));
    let problems = ((await loadContent(curriculum).catch((e: unknown) => e)) as ContentError).problems.join("\n");
    expect(problems).toContain('"c9" is not one of the lab\'s clusters (c1, c2)');
    expect(problems).toContain("tasks.1.cluster: required when the lab has more than one cluster");

    await writeFile(path.join(dir, "labs/sample/multi.yaml"), lab("[c1, grader]", "c1"));
    problems = ((await loadContent(curriculum).catch((e: unknown) => e)) as ContentError).problems.join("\n");
    expect(problems).toContain("clusters.1: is reserved");

    await writeFile(path.join(dir, "labs/sample/multi.yaml"), lab("[c1, c2, c3, c4]", "c1"));
    problems = ((await loadContent(curriculum).catch((e: unknown) => e)) as ContentError).problems.join("\n");
    expect(problems).toContain("expected array to have <=3 items");
  });
});

function mockBase(): LabInput {
  return {
    id: "m",
    title: "t",
    summary: "s",
    tier: 1,
    minutes: 60,
    passPercent: 66,
    competencies: ["cka/storage/implement-storage-classes-dynamic-volume"],
    docs: [],
    clusters: ["c1"],
    images: [],
    solution: "true",
    mock: true,
    tasks: [1, 2, 3, 4].map((n) => ({
      id: `t${n}`,
      title: "t",
      weight: 25,
      body: "b",
      hints: [],
      competency: "cka/storage/implement-storage-classes-dynamic-volume",
      checks: [{ id: `c${n}`, description: "d", runIn: "grader" as const, script: "true" }],
    })),
  };
}

function questionOf(id: string, competency: string) {
  return {
    id,
    kind: "single",
    competencies: [competency],
    stem: "Q?",
    options: [
      { id: "a", text: "A", correct: true },
      { id: "b", text: "B" },
    ],
    explanation: "E",
    source: { title: "S", url: "https://kubernetes.io/docs/" },
  };
}
