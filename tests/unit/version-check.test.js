import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:https", () => ({
  default: {
    get: vi.fn((_url, _opts, cb) => {
      const res = { statusCode: 200, on: vi.fn((ev, fn) => { if (ev === "data") fn('{"version":"9.9.9"}'); if (ev === "end") fn(); }), resume: vi.fn() };
      cb(res);
      return { on: vi.fn(), destroy: vi.fn() };
    }),
  },
}));

describe("versionCheck", () => {
  beforeEach(() => {
    global.__haiVersionCache = { distribution: { value: null, fetchedAt: 0 } };
  });

  it("does not contact npm 9router upstream", async () => {
    const https = (await import("node:https")).default;
    const { fetchUpstreamNpmVersion, getVersionStatus } = await import("@/lib/versionCheck.js");
    const upstream = await fetchUpstreamNpmVersion();
    expect(upstream).toBeNull();
    const npmCalls = https.get.mock.calls.filter(([url]) => String(url).includes("registry.npmjs.org/9router"));
    expect(npmCalls.length).toBe(0);
    const status = await getVersionStatus();
    expect(status.hasUpstreamUpdate).toBeUndefined();
    expect(status.productName).toBe("HAI-Router");
  });
});
