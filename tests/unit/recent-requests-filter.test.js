import { describe, it, expect } from "vitest";
import { shouldIncludeRecentRequest, recentRequestDedupeKey } from "../../src/lib/db/repos/usageRepo.js";

describe("shouldIncludeRecentRequest", () => {
  it("includes model_test even with zero tokens", () => {
    expect(shouldIncludeRecentRequest({
      promptTokens: 0,
      completionTokens: 0,
      requestKind: "model_test",
    })).toBe(true);
  });

  it("excludes zero-token success requests without model_test", () => {
    expect(shouldIncludeRecentRequest({
      promptTokens: 0,
      completionTokens: 0,
      status: "ok",
    })).toBe(false);
  });

  it("includes zero-token partial or estimated requests", () => {
    expect(shouldIncludeRecentRequest({
      promptTokens: 0,
      completionTokens: 0,
      usageStatus: "estimated",
    })).toBe(true);
  });
});

describe("recentRequestDedupeKey", () => {
  it("uses full timestamp for model_test so each probe stays visible", () => {
    const a = recentRequestDedupeKey({
      timestamp: "2026-09-01T09:42:53.100Z",
      model: "muse-spark-1.2-contributor-free",
      provider: "opencode",
      promptTokens: 0,
      completionTokens: 0,
      requestKind: "model_test",
    });
    const b = recentRequestDedupeKey({
      timestamp: "2026-09-01T09:42:53.900Z",
      model: "muse-spark-1.2-contributor-free",
      provider: "opencode",
      promptTokens: 0,
      completionTokens: 0,
      requestKind: "model_test",
    });
    expect(a).not.toBe(b);
  });

  it("dedupes regular requests within the same minute by token counts", () => {
    const base = {
      timestamp: "2026-09-01T09:42:53.100Z",
      model: "gpt-4",
      provider: "openai",
      promptTokens: 10,
      completionTokens: 5,
    };
    expect(recentRequestDedupeKey(base)).toBe(recentRequestDedupeKey({
      ...base,
      timestamp: "2026-09-01T09:42:59.999Z",
    }));
  });
});
