import { describe, expect, it } from "vitest";
import {
  VideoSchema,
  diagramRefsInBody,
  draftVideo,
  lessonMediaProblems,
  linesOf,
  loadContent,
  loadCurriculum,
  narrationHash,
  splitSentences,
  type Diagrams,
  type Video,
} from "../src/index.ts";

const diagrams: Diagrams = {
  flow: {
    title: "Flow",
    nodes: [
      { id: "a", label: "A", icon: "pod", col: 0, row: 0, tone: "default" },
      { id: "b", label: "B", icon: "service", col: 1, row: 0, tone: "primary" },
    ],
    edges: [{ from: "a", to: "b", dashed: false, both: false }],
    groups: [{ id: "g", label: "Group", nodes: ["a"] }],
  },
};

function video(scenes: unknown[]): Video {
  return VideoSchema.parse({ scenes });
}

describe("lesson media", () => {
  it("splits narration into sentences without breaking versions, addresses or abbreviations", () => {
    expect(splitSentences("The IP is 10.96.0.1 here. Use v1.34 now! e.g. a Pod works.   Next one?")).toEqual([
      "The IP is 10.96.0.1 here.",
      "Use v1.34 now! e.g. a Pod works.",
      "Next one?",
    ]);
  });

  it("addresses narration by voice, speed and text", () => {
    expect(narrationHash("af_heart", 1, "Hi.")).toMatch(/^[0-9a-f]{32}$/);
    expect(narrationHash("af_heart", 1, "Hi.")).not.toBe(narrationHash("af_heart", 1.1, "Hi."));
    expect(narrationHash("af_heart", 1, "Hi.")).not.toBe(narrationHash("bm_george", 1, "Hi."));
  });

  it("reads line ranges", () => {
    expect(linesOf("1,4-6")).toEqual([1, 4, 5, 6]);
  });

  it("finds diagrams placed in the body", () => {
    expect(diagramRefsInBody('Text\n\n<Diagram id="flow" />\n<Diagram  id=\'other\'/>')).toEqual(["flow", "other"]);
  });

  it("checks that the body, diagrams and video refer to real things", () => {
    const v = video([
      { id: "one", title: "One", narration: "First. Second.", visual: { kind: "diagram", diagram: "flow", steps: [["a"], ["a-b", "nope"]] } },
      { id: "one", title: "Two", narration: "Only one sentence.", visual: { kind: "points", items: ["x", "y"] } },
      { id: "three", title: "Three", narration: "One. Two.", visual: { kind: "code", code: "a\nb\n", steps: ["1", "3"] } },
      { id: "four", title: "Four", narration: "Hi.", visual: { kind: "diagram", diagram: "missing" } },
    ]);
    expect(lessonMediaProblems({ body: '<Diagram id="flow" /> <Diagram id="gone" />', diagrams, video: v })).toEqual([
      'body: <Diagram id="gone"> names no diagram in the front matter',
      "video.scenes.0.visual: diagram flow has no node, edge or group nope",
      "video.scenes.1: duplicate scene id one",
      "video.scenes.1: 2 visual steps but 1 narration sentences; each step needs a sentence",
      "video.scenes.2.visual: lines 3 are outside the code (2 lines)",
      "video.scenes.3.visual: diagram missing is not in the lesson's diagrams",
    ]);
  });

  it("reports overlapping nodes and edges to unknown nodes", () => {
    const bad: Diagrams = {
      d: {
        title: "Bad",
        nodes: [
          { id: "a", label: "A", icon: "pod", col: 0, row: 0, tone: "default" },
          { id: "b", label: "B", icon: "pod", col: 0, row: 0, tone: "default" },
        ],
        edges: [{ from: "a", to: "c", dashed: false, both: false }],
        groups: [],
      },
    };
    expect(lessonMediaProblems({ body: "", diagrams: bad })).toEqual(["diagrams.d: nodes overlap at col 0, row 0", "diagrams.d: edge to unknown node c"]);
  });

  it("drafts a valid video from the written lesson, one scene per section", () => {
    const body = [
      "## Why it exists",
      "Pods change. A **Service** stays. It spreads load.",
      "",
      "## Picture",
      '<Diagram id="flow" />',
      "The client calls B.",
      "",
      "## Commands",
      "Run these.",
      "```bash",
      "kubectl get svc",
      "```",
      "",
      "## List",
      "Some points. Two of them.",
      "- first `thing`",
      "- second",
    ].join("\n");
    const v = draftVideo({ title: "Services", summary: "One address.", body, diagrams });
    expect(VideoSchema.safeParse(v).success).toBe(true);
    expect(v.scenes.map((s) => [s.id, s.visual.kind])).toEqual([
      ["intro", "title"],
      ["why-it-exists", "title"],
      ["picture", "diagram"],
      ["commands", "terminal"],
      ["list", "points"],
    ]);
    expect(v.scenes[1]!.narration).toBe("Pods change. A Service stays. It spreads load.");
    expect(lessonMediaProblems({ body, diagrams, video: v })).toEqual([]);
  });

  it("every lesson's video fits its diagrams and narration", async () => {
    const content = await loadContent(await loadCurriculum());
    const intro = content.lessons.find((l) => l.id === "cka-course-introduction")!;
    expect(intro.video?.scenes.length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(intro.diagrams)).toEqual(["course-map", "control-loop", "study-loop"]);
    for (const lesson of content.lessons) expect(lessonMediaProblems(lesson), lesson.id).toEqual([]);
  });
});
