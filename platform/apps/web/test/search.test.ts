import { describe, expect, it } from "vitest";
import { highlightParts, isSearchKind, plainText, scoreItem, snippetAround, tokenize, truncate } from "../src/lib/search.ts";

describe("tokenize", () => {
  it("lowercases, drops short words and duplicates, keeps dots and dashes inside words", () => {
    expect(tokenize("Pod a RBAC pod kube-proxy k8s.io. -x")).toEqual(["pod", "rbac", "kube-proxy", "k8s.io"]);
  });
  it("keeps at most six words", () => {
    expect(tokenize("aa bb cc dd ee ff gg hh")).toHaveLength(6);
  });
  it("returns nothing for punctuation", () => {
    expect(tokenize(" %% _ ")).toEqual([]);
  });
});

describe("scoreItem", () => {
  it("is zero when nothing matches", () => {
    expect(scoreItem(["etcd"], { title: "Pods", body: "services" })).toBe(0);
  });
  it("ranks an item with every word above one with a single word in the title", () => {
    const both = scoreItem(["rbac", "pod"], { title: "Roles", body: "RBAC lets a pod read secrets" });
    const one = scoreItem(["rbac", "pod"], { title: "Pod basics", secondary: "pod pod" });
    expect(both).toBeGreaterThan(one);
  });
  it("puts title hits above body hits", () => {
    expect(scoreItem(["pod"], { title: "Pod" })).toBeGreaterThan(scoreItem(["pod"], { title: "x", body: "pod" }));
  });
  it("lifts an exact cert code", () => {
    const tokens = tokenize("cka");
    expect(scoreItem(tokens, { title: "CKA Certified Kubernetes Administrator", exact: "CKA" }, "cka")).toBeGreaterThan(
      scoreItem(tokens, { title: "CKAD Certified Kubernetes Application Developer", exact: "CKAD" }, "cka"),
    );
  });
});

describe("plainText and snippets", () => {
  it("strips code fences, tags, links and marks", () => {
    expect(plainText("## Title\n\nUse **kubectl** [docs](https://x)\n```sh\nrm -rf\n```\n<Callout>Hi</Callout>")).toBe("Title Use kubectl docs Hi");
  });
  it("cuts around the first match on word boundaries", () => {
    const text = `${"lorem ".repeat(40)}the kubelet restarts pods ${"ipsum ".repeat(40)}`;
    const s = snippetAround(text, ["kubelet"], 60)!;
    expect(s).toContain("kubelet");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(64);
  });
  it("has no snippet without a match", () => {
    expect(snippetAround("abc", ["zz"])).toBeUndefined();
  });
  it("truncates with an ellipsis", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abc", 4)).toBe("abc");
  });
});

describe("highlightParts", () => {
  it("marks every case-insensitive match and keeps the original text", () => {
    const parts = highlightParts("Pods and pod.spec", ["pod"]);
    expect(parts.map((p) => p.text).join("")).toBe("Pods and pod.spec");
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(["Pod", "pod"]);
  });
  it("escapes regex characters in tokens", () => {
    expect(highlightParts("k8s.io and k8sxio", ["k8s.io"]).filter((p) => p.hit).map((p) => p.text)).toEqual(["k8s.io"]);
  });
});

it("knows the search kinds", () => {
  expect(isSearchKind("lab")).toBe(true);
  expect(isSearchKind("user")).toBe(false);
});
