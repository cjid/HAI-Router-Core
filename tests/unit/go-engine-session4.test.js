import { describe, it, expect, afterEach, vi } from "vitest";

describe("goEngine Session 4 hardening", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    delete process.env.HAI_GO_ENGINE;
    delete process.env.HAI_PATCH_GLOBAL_FETCH;
    globalThis.fetch = originalFetch;
    vi.resetModules();
  });

  it("does not patch global fetch by default when Go engine is canonical", async () => {
    vi.resetModules();
    delete process.env.HAI_GO_ENGINE;
    delete process.env.HAI_PATCH_GLOBAL_FETCH;
    await import("../../open-sse/utils/proxyFetch.js");
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it("patches global fetch when HAI_PATCH_GLOBAL_FETCH=1", async () => {
    vi.resetModules();
    process.env.HAI_PATCH_GLOBAL_FETCH = "1";
    const mod = await import("../../open-sse/utils/proxyFetch.js");
    expect(globalThis.fetch).not.toBe(originalFetch);
    expect(globalThis.fetch).toBe(mod.default);
  });
});
