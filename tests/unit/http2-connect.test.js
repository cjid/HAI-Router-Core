import { describe, it, expect } from "vitest";
import { isProxyConfigured } from "../../open-sse/utils/http2Connect.js";

describe("isProxyConfigured", () => {
  it("detects connection proxy", () => {
    expect(isProxyConfigured({ connectionProxyEnabled: true, connectionProxyUrl: "http://127.0.0.1:7890" })).toBe(true);
  });

  it("detects vercel relay", () => {
    expect(isProxyConfigured({ vercelRelayUrl: "https://relay.example/worker" })).toBe(true);
  });

  it("returns false for direct egress", () => {
    expect(isProxyConfigured(null)).toBe(false);
    expect(isProxyConfigured({})).toBe(false);
  });
});
