import { describe, expect, it } from "vitest";
import { qualifiedImage } from "../src/provider/docker.ts";

describe("qualifiedImage", () => {
  it("names images the way containerd lists them", () => {
    expect(qualifiedImage("nginx:1.27")).toBe("docker.io/library/nginx:1.27");
    expect(qualifiedImage("busybox")).toBe("docker.io/library/busybox:latest");
    expect(qualifiedImage("rancher/mirrored-pause:3.10.2")).toBe("docker.io/rancher/mirrored-pause:3.10.2");
    expect(qualifiedImage("registry.k8s.io/pause:3.10")).toBe("registry.k8s.io/pause:3.10");
    expect(qualifiedImage("localhost:5000/app")).toBe("localhost:5000/app:latest");
  });
});
