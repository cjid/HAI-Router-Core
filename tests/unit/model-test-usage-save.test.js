import { describe, it, expect, vi, beforeEach } from "vitest";

const saveRequestUsage = vi.fn(async () => {});

vi.mock("@/lib/usageDb.js", () => ({
  saveRequestUsage,
  appendRequestLog: vi.fn(),
  saveRequestDetail: vi.fn(),
}));

const { saveUsageStats, extractUsageFromResponse, resolvePersistedUsage } = await import("../../open-sse/handlers/chatCore/requestDetail.js");

describe("saveUsageStats — model_test without usage payload", () => {
  beforeEach(() => {
    saveRequestUsage.mockClear();
  });

  it("extractUsageFromResponse returns null when provider omits usage", () => {
    expect(extractUsageFromResponse({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    })).toBeNull();
  });

  it("estimates non-zero input tokens for model_test when provider omits usage", async () => {
    await saveUsageStats({
      provider: "opencode",
      model: "muse-spark-1.2-contributor-free",
      tokens: null,
      requestKind: "model_test",
      body: {
        model: "oc/muse-spark-1.2-contributor-free",
        messages: [{ role: "user", content: "Reply with one word: ok" }],
      },
      contentLength: 2,
      silent: true,
    });

    expect(saveRequestUsage).toHaveBeenCalledOnce();
    const entry = saveRequestUsage.mock.calls[0][0];
    expect(entry.usageMeta.requestKind).toBe("model_test");
    expect(entry.tokens.prompt_tokens).toBeGreaterThan(0);
    expect(entry.usageMeta.usageEstimated).toBe(true);
  });

  it("resolvePersistedUsage matches saveUsageStats token estimates for model_test", async () => {
    const body = {
      model: "oc/muse-spark-1.2-contributor-free",
      messages: [{ role: "user", content: "Reply with one word: ok" }],
    };
    const persisted = resolvePersistedUsage({
      tokens: null,
      requestKind: "model_test",
      body,
      contentLength: 2,
    });

    await saveUsageStats({
      provider: "opencode",
      model: "muse-spark-1.2-contributor-free",
      tokens: null,
      requestKind: "model_test",
      body,
      contentLength: 2,
      silent: true,
    });

    const entry = saveRequestUsage.mock.calls.at(-1)[0];
    expect(persisted.tokens.prompt_tokens).toBe(entry.tokens.prompt_tokens);
    expect(persisted.usageStatus).toBe("estimated");
    expect(persisted.usageSource).toBe("tokenizer");
  });
});
