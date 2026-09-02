import { describe, expect, it } from "vitest";
import { matchRouteSkeletonId } from "../../src/shared/components/skeleton/routeSkeletonMap.js";

describe("matchRouteSkeletonId", () => {
  it("resolves cli-tools for CLI Tools list", () => {
    expect(matchRouteSkeletonId("/dashboard/cli-tools")).toBe("cli-tools");
  });

  it("resolves cli-tool-detail for CLI tool routes", () => {
    expect(matchRouteSkeletonId("/dashboard/cli-tools/claude")).toBe("cli-tool-detail");
  });

  it("resolves providers and provider-detail", () => {
    expect(matchRouteSkeletonId("/dashboard/providers")).toBe("providers");
    expect(matchRouteSkeletonId("/dashboard/providers/openai")).toBe("provider-detail");
  });

  it("resolves proxy-pools, endpoint, combos, usage, quota", () => {
    expect(matchRouteSkeletonId("/dashboard/proxy-pools")).toBe("proxy-pools");
    expect(matchRouteSkeletonId("/dashboard")).toBe("endpoint");
    expect(matchRouteSkeletonId("/dashboard/endpoint")).toBe("endpoint");
    expect(matchRouteSkeletonId("/dashboard/combos")).toBe("combos");
    expect(matchRouteSkeletonId("/dashboard/usage")).toBe("usage");
    expect(matchRouteSkeletonId("/dashboard/quota")).toBe("quota");
  });

  it("resolves settings and go-engine", () => {
    expect(matchRouteSkeletonId("/dashboard/profile")).toBe("settings");
    expect(matchRouteSkeletonId("/dashboard/go-engine")).toBe("go-engine");
  });

  it("falls back to generic for unknown routes", () => {
    expect(matchRouteSkeletonId("/dashboard/skills")).toBe("generic");
    expect(matchRouteSkeletonId("/dashboard/console-log")).toBe("generic");
  });

  it("does not reuse CLI geometry for providers route", () => {
    expect(matchRouteSkeletonId("/dashboard/providers")).not.toBe("cli-tools");
  });
});
