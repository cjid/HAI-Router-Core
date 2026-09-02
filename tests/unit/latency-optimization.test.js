import { describe, it, expect, beforeEach } from "vitest";
import {
  createRequestTiming,
  recordLatencyObservation,
  resetLatencyStoreForTests,
  getLaneMetrics,
  getHealthState,
  HEALTH_STATE,
  scoreConnection,
  pickLatencyAwareConnection,
  estimateEffectiveLatencyMs,
  computeFirstByteTimeoutMs,
  computeConnectTimeoutMs,
  recordRateLimited,
} from "../../open-sse/latency/index.js";
import { hasMeaningfulTokenContent } from "../../open-sse/utils/streamHelpers.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { createPassthroughStreamWithLogger } from "../../open-sse/utils/stream.js";
import { pipeWithDisconnect, createStreamController } from "../../open-sse/utils/streamHandler.js";
import { resetLanesForTests, admit, getSchedulerStats } from "../../open-sse/concurrency/index.js";
import {
  trackPendingRequest,
  getPendingLifecycleSnapshot,
} from "../../src/lib/db/repos/usageRepo.js";
import { getDispatcher, resetProxyDispatchersForTests } from "../../open-sse/utils/proxyFetch.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resetPendingStore() {
  if (!global._pendingRequests) global._pendingRequests = { byModel: {}, byAccount: {} };
  if (!global._pendingTimers) global._pendingTimers = {};
  global._pendingRequests.byModel = {};
  global._pendingRequests.byAccount = {};
  for (const k of Object.keys(global._pendingTimers)) delete global._pendingTimers[k];
}

beforeEach(() => {
  resetLatencyStoreForTests();
  resetLanesForTests({ globalMax: 5, providerMax: 5, connectionMax: 4, queueMax: 16, queueTimeoutMs: 5000 });
  resetPendingStore();
  resetProxyDispatchersForTests?.();
});

describe("A — TTFT instrumentation correctness", () => {
  it("distinguishes TTFB from TTFT (metadata then content)", async () => {
    const timing = createRequestTiming();
    timing.mark("admission_done");
    timing.markUpstreamDispatch();

    expect(hasMeaningfulTokenContent({ choices: [{ delta: { role: "assistant" } }] }, FORMATS.OPENAI)).toBe(false);
    expect(hasMeaningfulTokenContent({ choices: [{ delta: { content: "hi" } }] }, FORMATS.OPENAI)).toBe(true);

    timing.markUpstreamFirstByte(Date.now());
    await sleep(100);
    timing.markClientFirstToken(Date.now() + 200);

    const phases = timing.phases();
    expect(phases.time_to_first_byte_ms).toBeTypeOf("number");
    expect(phases.time_to_first_token_ms).toBeTypeOf("number");
    expect(phases.time_to_first_token_ms).toBeGreaterThanOrEqual(phases.time_to_first_byte_ms);
  });
});

describe("B — Fast SSE relay", () => {
  it("forwards upstream chunk without extra buffering delay", async () => {
    const timing = createRequestTiming();
    const sse = [
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n',
      '\n',
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
      '\n',
      "data: [DONE]\n\n",
    ].join("");

    const upstream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(sse));
        c.close();
      },
    });

    const transform = createPassthroughStreamWithLogger("openai", null, "gpt-test", "conn-a", null, null, null, timing);
    const ctrl = createStreamController({ provider: "openai", model: "gpt-test" });
    const out = pipeWithDisconnect({ body: upstream, headers: new Headers() }, transform, ctrl, null, 5000, null, { started: false }, timing, 3000);

    const reader = out.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }

    expect(chunks.join("")).toContain("Hello");
    expect(timing.phases().time_to_first_token_ms).toBeTypeOf("number");
  });
});

describe("C — Connection reuse", () => {
  it("reuses ProxyAgent for same proxy URL", async () => {
    const url = "http://127.0.0.1:19999";
    const d1 = await getDispatcher(url);
    const d2 = await getDispatcher(url);
    expect(d1).toBe(d2);
  });
});

describe("D — Egress isolation", () => {
  it("different proxy URLs get different dispatchers", async () => {
    const d1 = await getDispatcher("http://127.0.0.1:19998");
    const d2 = await getDispatcher("http://127.0.0.1:19997");
    expect(d1).not.toBe(d2);
  });
});

describe("E — Dynamic latency ranking", () => {
  it("prefers faster healthy connection", () => {
    for (let i = 0; i < 8; i++) {
      recordLatencyObservation({ providerId: "openai", connectionId: "fast", success: true, ttftMs: 300, ttfbMs: 150 });
      recordLatencyObservation({ providerId: "openai", connectionId: "slow", success: true, ttftMs: 900, ttfbMs: 500 });
    }

    const picked = pickLatencyAwareConnection(
      [{ id: "slow", priority: 1 }, { id: "fast", priority: 1 }],
      { providerId: "openai" },
    );
    expect(picked.id).toBe("fast");
  });
});

describe("F — Saturation awareness", () => {
  it("slightly slower free lane beats saturated fast lane", () => {
    for (let i = 0; i < 8; i++) {
      recordLatencyObservation({ providerId: "openai", connectionId: "fast", success: true, ttftMs: 400 });
      recordLatencyObservation({ providerId: "openai", connectionId: "free", success: true, ttftMs: 550 });
    }

    const fastScore = scoreConnection({ id: "fast", priority: 1 }, {
      providerId: "openai",
      laneStatsByConnection: { fast: { capacity: 4, active: 4, queued: 6 } },
    }).score;

    const freeScore = scoreConnection({ id: "free", priority: 1 }, {
      providerId: "openai",
      laneStatsByConnection: { free: { capacity: 4, active: 1, queued: 0 } },
    }).score;

    expect(freeScore).toBeLessThan(fastScore);
    expect(estimateEffectiveLatencyMs({
      metrics: getLaneMetrics("openai", "free"),
      laneStats: { capacity: 4, active: 1, queued: 0 },
    })).toBeLessThan(estimateEffectiveLatencyMs({
      metrics: getLaneMetrics("openai", "fast"),
      laneStats: { capacity: 4, active: 4, queued: 6 },
    }));
  });
});

describe("G — Degraded recovery", () => {
  it("latency spike marks degraded then recovers after successes", () => {
    for (let i = 0; i < 6; i++) {
      recordLatencyObservation({ providerId: "p", connectionId: "c1", success: true, ttftMs: 300 });
    }
    recordLatencyObservation({ providerId: "p", connectionId: "c1", success: true, ttftMs: 5000 });
    expect(getHealthState("p", "c1")).toBe(HEALTH_STATE.DEGRADED_LATENCY);

    for (let i = 0; i < 3; i++) {
      recordLatencyObservation({ providerId: "p", connectionId: "c1", success: true, ttftMs: 320 });
    }
    expect(getHealthState("p", "c1")).toBe(HEALTH_STATE.HEALTHY);
  });
});

describe("H — Timeout adaptation", () => {
  it("uses defaults with insufficient samples and adapts with enough data", () => {
    expect(computeFirstByteTimeoutMs("p", "new")).toBeGreaterThan(5000);
    for (let i = 0; i < 6; i++) {
      recordLatencyObservation({ providerId: "p", connectionId: "c1", success: true, ttfbMs: 400, ttftMs: 600 });
    }
    const adapted = computeFirstByteTimeoutMs("p", "c1");
    expect(adapted).toBeGreaterThanOrEqual(8000);
    expect(adapted).toBeLessThanOrEqual(200000);
    expect(computeConnectTimeoutMs("p", "c1")).toBeGreaterThanOrEqual(5000);
  });
});

describe("I — Rate-limit separation", () => {
  it("429 marks RATE_LIMITED not transport failure", () => {
    recordRateLimited("openai", "c1");
    expect(getHealthState("openai", "c1")).toBe(HEALTH_STATE.RATE_LIMITED);
    recordLatencyObservation({ providerId: "openai", connectionId: "c1", success: false, status: 429 });
    expect(getHealthState("openai", "c1")).toBe(HEALTH_STATE.RATE_LIMITED);
  });
});

describe("K — 5 concurrent SSE (scheduler regression)", () => {
  it("admit/release leaves clean scheduler state", async () => {
    const tickets = await Promise.all(
      Array.from({ length: 5 }, (_, i) => admit({ providerId: "openai", connectionId: `c-reg-${i}` })),
    );
    for (const t of tickets) t.release();
    const stats = getSchedulerStats();
    expect(stats.lanes.global.active).toBe(0);
    expect(stats.lanes.global.queued).toBe(0);
  });
});

describe("M — Cancellation cleanup", () => {
  it("abort during stream clears pending counters", async () => {
    const ac = new AbortController();
    const ticket = await admit({ providerId: "openai", connectionId: "c-cancel", signal: ac.signal });
    const token = trackPendingRequest("m", "openai", "c-cancel", true);
    ac.abort();
    ticket.release();
    trackPendingRequest("m", "openai", "c-cancel", false, true, token);
    const snap = getPendingLifecycleSnapshot();
    expect(snap.totalPending).toBe(0);
  });
});

describe("Phase 16 — dynamic latency stress (mock)", () => {
  it("50 requests under cap 5 leave zero active/queued/pending", async () => {
    resetLanesForTests({ globalMax: 5, providerMax: 5, connectionMax: 4, queueMax: 128, queueTimeoutMs: 15000 });

    const ttfts = [];
    async function worker(id) {
      const conn = id % 3 === 0 ? "A" : id % 3 === 1 ? "B" : "C";
      const base = conn === "A" ? 25 : conn === "B" ? 40 : 30;
      const ticket = await admit({ providerId: "mock", connectionId: conn });
      const token = trackPendingRequest("mock-model", "mock", conn, true);
      const t0 = Date.now();
      await sleep(base + (id % 15));
      ttfts.push(Date.now() - t0);
      recordLatencyObservation({
        providerId: "mock",
        connectionId: conn,
        success: true,
        ttftMs: Date.now() - t0,
        ttfbMs: Math.round((Date.now() - t0) * 0.4),
      });
      trackPendingRequest("mock-model", "mock", conn, false, false, token);
      ticket.release();
    }

    const batchSize = 10;
    for (let start = 0; start < 50; start += batchSize) {
      const batch = Array.from({ length: Math.min(batchSize, 50 - start) }, (_, j) => worker(start + j));
      await Promise.all(batch);
    }

    const stats = getSchedulerStats();
    expect(stats.lanes.global.active).toBe(0);
    expect(stats.lanes.global.queued).toBe(0);
    expect(getPendingLifecycleSnapshot().totalPending).toBe(0);

    ttfts.sort((a, b) => a - b);
    const p50 = ttfts[Math.floor(ttfts.length * 0.5)];
    const p95 = ttfts[Math.floor(ttfts.length * 0.95)];
    expect(p50).toBeGreaterThan(0);
    expect(p95).toBeGreaterThanOrEqual(p50);
  }, 30_000);
});
