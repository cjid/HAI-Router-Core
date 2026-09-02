import { describe, it, expect } from "vitest";
import { ensureModelTestUsage, estimateInputTokens } from "../../open-sse/utils/usageTracking.js";

const probeBody = {
  model: "oc/muse-spark-1.2-contributor-free",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Reply with one word: ok" }],
};

describe("ensureModelTestUsage", () => {
  it("fills non-zero prompt tokens when upstream usage is missing", () => {
    const usage = ensureModelTestUsage(null, { body: probeBody, contentLength: 0 });
    expect(usage.prompt_tokens).toBeGreaterThan(0);
    expect(usage.estimated).toBe(true);
    expect(usage.prompt_tokens).toBeGreaterThanOrEqual(estimateInputTokens(probeBody));
  });

  it("preserves provider-reported tokens when already present", () => {
    const usage = ensureModelTestUsage(
      { prompt_tokens: 248, completion_tokens: 127 },
      { body: probeBody, contentLength: 10 },
    );
    expect(usage.prompt_tokens).toBe(248);
    expect(usage.completion_tokens).toBe(127);
  });

  it("estimates output tokens from response content length", () => {
    const usage = ensureModelTestUsage(null, { body: probeBody, contentLength: 8 });
    expect(usage.prompt_tokens).toBeGreaterThan(0);
    expect(usage.completion_tokens).toBeGreaterThan(0);
  });
});
