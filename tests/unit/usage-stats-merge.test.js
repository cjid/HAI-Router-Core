import { describe, it, expect } from "vitest";
import { mergeRealtimeStats } from "../../src/shared/utils/usageStatsMerge.js";

describe("mergeRealtimeStats", () => {
  const base = {
    totalRequests: 10,
    totalPromptTokens: 1000,
    totalCompletionTokens: 200,
    activeRequests: [],
    recentRequests: [],
  };

  it("drops frames from a different period", () => {
    const next = mergeRealtimeStats(base, { period: "today", kind: "full", totalRequests: 99 }, "7d");
    expect(next).toBe(base);
    expect(next.totalRequests).toBe(10);
  });

  it("live frame patches only live fields, leaves totals untouched", () => {
    const next = mergeRealtimeStats(base, {
      period: "today",
      kind: "live",
      activeRequests: [{ model: "gpt", provider: "openai", count: 1 }],
      recentRequests: [{ model: "gpt", provider: "openai", promptTokens: 5, completionTokens: 1 }],
    }, "today");
    expect(next.totalRequests).toBe(10);
    expect(next.totalPromptTokens).toBe(1000);
    expect(next.activeRequests).toHaveLength(1);
    expect(next.recentRequests).toHaveLength(1);
  });

  it("full frame replaces stats wholesale", () => {
    const next = mergeRealtimeStats(base, {
      period: "7d",
      kind: "full",
      totalRequests: 50,
      totalPromptTokens: 5000,
      totalCompletionTokens: 800,
      byModel: { "gpt (openai)": { requests: 50 } },
    }, "7d");
    expect(next.totalRequests).toBe(50);
    expect(next.byModel["gpt (openai)"].requests).toBe(50);
    expect(next.activeRequests).toBeUndefined();
  });

  it("unknown kind defaults to full replace (safe direction)", () => {
    const next = mergeRealtimeStats(base, {
      period: "today",
      totalRequests: 3,
      totalPromptTokens: 300,
    }, "today");
    expect(next.totalRequests).toBe(3);
    expect(next.totalPromptTokens).toBe(300);
  });
});
