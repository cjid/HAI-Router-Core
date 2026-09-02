import { describe, it, expect } from "vitest";
import { buildRequestDetailMetrics } from "../../src/shared/utils/requestDetailMetrics.js";

describe("requestDetailMetrics", () => {
  it("builds OpenRouter-style metrics from a streaming detail", () => {
    const metrics = buildRequestDetailMetrics({
      provider: "opencode",
      model: "mimo-v2.5-free",
      status: "partial",
      terminationReason: "client_cancelled",
      usageSource: "tokenizer",
      tokens: { prompt_tokens: 9200, completion_tokens: 517 },
      latency: {
        ttft: 3224,
        total: 4690,
        phases: {
          queue_wait_ms: 5,
          routing_ms: 12,
          upstream_connect_ms: 618,
          time_to_first_token_ms: 3224,
          total_ms: 4690,
        },
      },
      streamStats: {
        stream_started: true,
        chunks_received: 77,
        bytes_received: 11386,
        duration_ms: 1462,
      },
      request: { stream: true },
      response: { type: "streaming", finish_reason: null },
    });

    expect(metrics.inputTokens).toBe(9200);
    expect(metrics.outputTokens).toBe(517);
    expect(metrics.estimated).toBe(true);
    expect(metrics.throughput).toBeGreaterThan(0);
    expect(metrics.timeline).toHaveLength(3);
    expect(metrics.fmt.tokens(9200, 517, true)).toContain("→ ~517");
  });

  it("shows chunk stats in generation subtitle when tokens are zero", () => {
    const metrics = buildRequestDetailMetrics({
      provider: "opencode",
      model: "mimo-v2.5-free",
      status: "partial",
      tokens: { prompt_tokens: 0, completion_tokens: 0 },
      latency: { ttft: 0, total: 3833 },
      streamStats: { chunks_received: 316, bytes_received: 37010, duration_ms: 4574 },
      request: { stream: true },
    });

    expect(metrics.timeline[2].subtitle).toContain("316 chunks");
  });
});
