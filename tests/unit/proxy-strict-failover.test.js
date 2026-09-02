import { describe, it, expect } from "vitest";
import { resolveProxyFailureAction } from "../../open-sse/utils/proxyFetch.js";

describe("resolveProxyFailureAction", () => {
  it("throws when strictProxy is true", () => {
    const result = resolveProxyFailureAction({ strictProxy: true }, new Error("ECONNREFUSED"));
    expect(result.action).toBe("throw");
    expect(result.error?.message).toMatch(/strictProxy=true/);
  });

  it("allows direct fallback when strictProxy is false", () => {
    const result = resolveProxyFailureAction({ strictProxy: false }, new Error("timeout"));
    expect(result.action).toBe("fallback_direct");
  });

  it("allows direct fallback when proxyOptions is null", () => {
    const result = resolveProxyFailureAction(null, new Error("timeout"));
    expect(result.action).toBe("fallback_direct");
  });
});
