import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CertificationSchema,
  DEFAULT_CONTENT_DIR,
  buildCoverageIndex,
  coverageGaps,
  getCert,
  listCerts,
  loadCurriculum,
  programMembers,
  searchCompetencies,
  type Curriculum,
} from "../src/index.ts";
import { checkAgainstText, normalize } from "../src/sources.ts";

const GOLDEN = [
  "CKA", "CKAD", "CKS", "KCNA", "KCSA", "LFCS", "CNPE", "CKNE", "PCA",
  "ICA", "CCA", "CAPA", "CGOA", "CBA", "OTCA", "KCA", "CNPA",
];
const PERFORMANCE = ["CKA", "CKAD", "CKS", "LFCS", "CNPE", "CKNE"];

let curriculum: Curriculum;
beforeAll(async () => {
  curriculum = await loadCurriculum();
});

describe("curriculum content", () => {
  it("has exactly the 17 Golden Kubestronaut certifications", () => {
    expect([...curriculum.certs.keys()].sort()).toEqual([...GOLDEN].sort());
    expect(programMembers(curriculum, "golden-kubestronaut").map((c) => c.code).sort()).toEqual([...GOLDEN].sort());
  });

  it("marks the six performance-based exams", () => {
    expect(listCerts(curriculum, { examStyle: "performance" }).map((c) => c.code).sort()).toEqual([...PERFORMANCE].sort());
  });

  it("adds CKNE to Golden Kubestronaut on 15 Feb 2027", () => {
    const before = programMembers(curriculum, "golden-kubestronaut", "2027-02-14").map((c) => c.code);
    const after = programMembers(curriculum, "golden-kubestronaut", "2027-02-15").map((c) => c.code);
    expect(before).not.toContain("CKNE");
    expect(after).toContain("CKNE");
    expect(after).toHaveLength(17);
  });

  it("gives every competency a unique, well-formed id", () => {
    for (const [id, { cert }] of curriculum.competencies) {
      expect(id).toMatch(/^[a-z]{2,6}\/[a-z0-9-]+\/[a-z0-9-]+$/);
      expect(id.startsWith(`${cert.code.toLowerCase()}/`)).toBe(true);
    }
    const total = [...curriculum.certs.values()].flatMap((c) => c.domains.flatMap((d) => d.competencies)).length;
    expect(curriculum.competencies.size).toBe(total);
  });

  it("only leaves competencies empty where verification is pending", () => {
    for (const cert of curriculum.certs.values()) {
      if (cert.curriculum.verification === "pending") continue;
      for (const d of cert.domains) expect(d.competencies.length, `${cert.code} ${d.name}`).toBeGreaterThan(0);
    }
  });
});

describe("schema", () => {
  const base = {
    code: "XYZ",
    name: "Example",
    examStyle: "multiple-choice",
    curriculum: { source: { kind: "web", url: "https://example.com" }, retrievedAt: "2026-11-24", verification: "text" },
    domains: [{ key: "one", name: "One", weight: 100, competencies: [{ key: "a", statement: "A" }] }],
  };

  it("accepts a minimal certification", () => {
    expect(CertificationSchema.safeParse(base).success).toBe(true);
  });

  it("rejects weights that do not sum to 100", () => {
    const bad = { ...base, domains: [{ ...base.domains[0], weight: 90 }] };
    const result = CertificationSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("sum to 90");
  });

  it("rejects duplicate competency keys and unknown fields", () => {
    const dup = {
      ...base,
      domains: [{ ...base.domains[0], competencies: [{ key: "a", statement: "A" }, { key: "a", statement: "B" }] }],
    };
    expect(CertificationSchema.safeParse(dup).success).toBe(false);
    expect(CertificationSchema.safeParse({ ...base, extra: true }).success).toBe(false);
  });
});

describe("queries", () => {
  it("looks up certs case-insensitively and explains unknown codes", () => {
    expect(getCert(curriculum, "cka").name).toBe("Certified Kubernetes Administrator");
    expect(() => getCert(curriculum, "NOPE")).toThrow(/Known: /);
  });

  it("finds competencies by keyword", () => {
    const hits = searchCompetencies(curriculum, "etcd backup kubeadm", { cert: "CKA" });
    expect(hits[0]?.id).toBe("cka/cluster-architecture-installation-configuration/create-manage-kubernetes-clusters-kubeadm");
    expect(searchCompetencies(curriculum, "gateway api").some((h) => h.cert === "CKNE")).toBe(true);
  });
});

describe("coverage", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lfct-content-"));
    await cp(path.join(DEFAULT_CONTENT_DIR, "curriculum"), path.join(dir, "curriculum"), { recursive: true });
    await mkdir(path.join(dir, "lessons/cka"), { recursive: true });
    await mkdir(path.join(dir, "questions"), { recursive: true });
    await writeFile(
      path.join(dir, "lessons/cka/storage-classes.mdx"),
      "---\ntitle: Storage classes\ncompetencies:\n  - cka/storage/implement-storage-classes-dynamic-volume\n---\n# Storage classes\n",
    );
    await writeFile(
      path.join(dir, "questions/cka.yaml"),
      "questions:\n  - id: q1\n    competencies: [cka/storage/implement-storage-classes-dynamic-volume]\n  - id: q2\n    competencies: [cka/storage/typo]\n",
    );
  });
  afterAll(async () => rm(dir, { recursive: true, force: true }));

  it("indexes tags from MDX front matter and nested YAML, and reports unknown tags", async () => {
    const local = await loadCurriculum(dir);
    const coverage = await buildCoverageIndex(local);
    const refs = coverage.byCompetency.get("cka/storage/implement-storage-classes-dynamic-volume");
    expect(refs?.map((r) => r.kind).sort()).toEqual(["lessons", "questions"]);
    expect(coverage.unknownTags).toEqual([{ file: "questions/cka.yaml", tag: "cka/storage/typo" }]);

    const gaps = coverageGaps(local, coverage, "CKA");
    const storage = gaps.find((g) => g.id === "cka/storage/implement-storage-classes-dynamic-volume");
    expect(storage?.missing).toEqual(["labs"]);
    expect(gaps[0]?.domainWeight).toBe(30); // Troubleshooting first: heaviest domain
  });
});

describe("source text check", () => {
  it("ignores hyphenation and line breaks but catches a changed statement", () => {
    const cert = getCert(curriculum, "KCNA");
    const text = cert.domains
      .map((d) => `${d.weight}% - ${d.name}\n${d.competencies.map((c) => `• ${c.statement}`).join("\n")}`)
      .join("\n")
      .replace("Containerization", "Container-\nization");
    expect(checkAgainstText(cert, text)).toEqual([]);
    expect(checkAgainstText(cert, text.replace("Debugging", "Debuging"))).toEqual([
      'KCNA: competency "Debugging" (cloud-native-application-delivery) not found in the PDF',
    ]);
    expect(normalize("Pod-to-Pod  encryption (Cilium)")).toBe("podtopodencryptioncilium");
  });
});
