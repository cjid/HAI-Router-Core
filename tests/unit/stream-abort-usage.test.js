import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPassthroughStreamWithLogger } from "../../open-sse/utils/stream.js";
import { pipeWithDisconnect, createStreamController } from "../../open-sse/utils/streamHandler.js";
import {
  classifyStreamTermination,
  resolveUsageConfidence,
  resetStreamAbortMetricsForTests,
  getStreamAbortMetrics,
  TERMINATION_REASON,
  USAGE_STATUS,
} from "../../open-sse/stream/streamAbort.js";
import { buildStreamTerminalMeta } from "../../open-sse/handlers/chatCore/requestDetail.js";
import {
  trackPendingRequest,
  getPendingLifecycleSnapshot,
} from "../../src/lib/db/repos/usageRepo.js";
import {
  resetSchedulerStatsForTests,
  resetLanesForTests,
  getSchedulerStats,
} from "../../open-sse/concurrency/index.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resetPendingStore() {
  if (!global._pendingRequests) global._pendingRequests = { byModel: {}, byAccount: {} };
  if (!global._pendingTimers) global._pendingTimers = {};
  global._pendingRequests.byModel = {};
  global._pendingRequests.byAccount = {};
  for (const k of Object.keys(global._pendingTimers)) delete global._pendingTimers[k];
}

function makeOpenAIChunk(content, extra = {}) {
  const payload = {
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    choices: [{ delta: { content }, index: 0, finish_reason: extra.finish_reason ?? null }],
  };
  if (extra.usage) payload.usage = extra.usage;
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function drainStream(readable, { cancelAfter = null } = {}) {
  const reader = readable.getReader();
  let count = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count++;
      if (cancelAfter != null && count >= cancelAfter) {
        await reader.cancel("ResponseAborted");
        break;
      }
    }
  } catch {
    /* expected on abort */
  }
  return count;
}

async function runMockSse({
  chunks,
  onComplete,
  body = { messages: [{ role: "user", content: "x".repeat(400) }] },
  usageEstimateBody = null,
  stallTimeoutMs = 8000,
  clientCancelAfter = null,
  upstreamErrorAfter = null,
} = {}) {
  let idx = 0;
  let errored = false;
  const upstream = new ReadableStream({
    pull(controller) {
      if (upstreamErrorAfter != null && idx >= upstreamErrorAfter && !errored) {
        errored = true;
        controller.error(new Error("upstream closed unexpectedly"));
        return;
      }
      if (idx >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(new TextEncoder().encode(chunks[idx++]));
    },
  });

  const completions = [];
    const transform = createPassthroughStreamWithLogger(
      "openai",
      null,
      "gpt-test",
      "conn-abort-1",
      body,
      (contentObj, usage, ttft, ctx) => {
        completions.push({ contentObj, usage, ttft, ctx });
        onComplete?.({ contentObj, usage, ttft, ctx });
      },
      null,
      null,
      usageEstimateBody || body,
    );
  const finalizeStreamFn = transform.finalize?.bind(transform) ?? null;

  const ctrl = createStreamController({});
  const out = pipeWithDisconnect(
    { body: upstream, headers: new Headers() },
    transform,
    ctrl,
    null,
    stallTimeoutMs,
    null,
    null,
    null,
    null,
    finalizeStreamFn,
  );

  await drainStream(out, { cancelAfter: clientCancelAfter });
  await sleep(80);
  return completions;
}

beforeEach(() => {
  resetStreamAbortMetricsForTests();
  resetPendingStore();
  resetSchedulerStatsForTests();
  resetLanesForTests({ globalMax: 5, providerMax: 5, connectionMax: 4, queueMax: 16 });
});

describe("streamAbort classification", () => {
  it("classifies client disconnect as client_cancelled", () => {
    const t = classifyStreamTermination({
      kind: "disconnect",
      reason: "ResponseAborted",
      clientConnected: false,
    });
    expect(t.terminationReason).toBe(TERMINATION_REASON.CLIENT_CANCELLED);
    expect(t.penalizeProvider).toBe(false);
  });

  it("classifies ResponseAborted after upstream EOF as completed (normal SSE teardown)", () => {
    const t = classifyStreamTermination({
      kind: "disconnect",
      reason: "ResponseAborted",
      clientConnected: false,
      upstreamEof: true,
      streamStarted: true,
      chunkCount: 167,
      totalBytes: 17529,
    });
    expect(t.terminationReason).toBe(TERMINATION_REASON.COMPLETED);
    expect(t.detailStatus).toBe("success");
  });

  it("classifies stall timeout as upstream_timeout", () => {
    const t = classifyStreamTermination({
      kind: "error",
      error: new Error("stream stall timeout"),
    });
    expect(t.terminationReason).toBe(TERMINATION_REASON.UPSTREAM_TIMEOUT);
    expect(t.penalizeProvider).toBe(true);
  });

  it("classifies provider upstream error as upstream_aborted", () => {
    const t = classifyStreamTermination({
      kind: "error",
      error: new Error("upstream closed unexpectedly"),
      clientConnected: true,
    });
    expect(t.terminationReason).toBe(TERMINATION_REASON.UPSTREAM_ABORTED);
    expect(t.penalizeProvider).toBe(true);
  });
});

describe("partial SSE usage retention", () => {
  it("A — abort after partial SSE retains usage", async () => {
    const chunks = Array.from({ length: 20 }, (_, i) => makeOpenAIChunk(`token${i} `));
    const completions = await runMockSse({
      chunks,
      upstreamErrorAfter: 20,
    });

    expect(completions.length).toBe(1);
    const { usage, ctx } = completions[0];
    expect(ctx.kind).toBe("error");
    expect(usage?.prompt_tokens ?? usage?.input_tokens ?? 0).toBeGreaterThan(0);
    expect(usage?.completion_tokens ?? usage?.output_tokens ?? 0).toBeGreaterThan(0);
    const meta = buildStreamTerminalMeta(ctx, usage);
    expect(meta.termination.requestStatus).toBe("partial");
    expect(meta.streamStats.chunks_received).toBeGreaterThan(0);
  });

  it("B — provider usage before abort is retained as provider partial", async () => {
    const chunks = [
      makeOpenAIChunk("hello"),
      makeOpenAIChunk(" world", { usage: { prompt_tokens: 120, completion_tokens: 2 } }),
    ];
    const completions = await runMockSse({ chunks, upstreamErrorAfter: 2 });
    expect(completions.length).toBe(1);
    const { usage, ctx } = completions[0];
    expect(usage?.prompt_tokens).toBeGreaterThanOrEqual(120);
    const conf = resolveUsageConfidence({
      usage,
      termination: classifyStreamTermination(ctx),
      contentLength: 11,
      hadProviderUsage: ctx.hadProviderUsage,
    });
    expect(conf.source).toBe("provider");
    expect(conf.status).toBe(USAGE_STATUS.PARTIAL);
  });

  it("C2 — tool-call-only stream abort estimates from upstream bytes", async () => {
    const toolChunk = `data: ${JSON.stringify({
      object: "chat.completion.chunk",
      choices: [{
        delta: {
          tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "read", arguments: "{\"path\":\"" } }],
        },
        index: 0,
      }],
    })}\n\n`;
    const chunks = Array.from({ length: 30 }, () => toolChunk);
    const completions = await runMockSse({ chunks, upstreamErrorAfter: 30 });
    expect(completions.length).toBe(1);
    const { usage } = completions[0];
    expect(usage?.prompt_tokens ?? usage?.input_tokens ?? 0).toBeGreaterThan(0);
    expect(usage?.completion_tokens ?? usage?.output_tokens ?? 0).toBeGreaterThan(0);
  });

  it("C — no final usage metadata yields estimated output", async () => {
    const chunks = [makeOpenAIChunk("partial output stream")];
    const completions = await runMockSse({ chunks, upstreamErrorAfter: 1 });
    expect(completions.length).toBe(1);
    const { usage, ctx } = completions[0];
    const conf = resolveUsageConfidence({
      usage,
      termination: classifyStreamTermination(ctx),
      contentLength: 20,
      hadProviderUsage: false,
    });
    expect(conf.status).toBe(USAGE_STATUS.ESTIMATED);
    expect(usage?.estimated).toBe(true);
  });

  it("D — does not fabricate cached tokens when unknown", async () => {
    const chunks = [makeOpenAIChunk("x")];
    const completions = await runMockSse({ chunks, upstreamErrorAfter: 1 });
    const { usage } = completions[0];
    expect(usage?.cached_tokens).toBeUndefined();
    expect(usage?.cache_read_input_tokens).toBeUndefined();
  });

  it("E — client cancellation retains usage without provider penalty", async () => {
    const chunks = Array.from({ length: 15 }, (_, i) => makeOpenAIChunk(`c${i}`));
    const completions = await runMockSse({ chunks, clientCancelAfter: 8 });
    expect(completions.length).toBe(1);
    const { usage, ctx } = completions[0];
    expect(usage?.completion_tokens ?? usage?.output_tokens ?? 0).toBeGreaterThan(0);
    const term = classifyStreamTermination({ ...ctx, reason: "ResponseAborted", clientConnected: false });
    expect(term.terminationReason).toBe(TERMINATION_REASON.CLIENT_CANCELLED);
    expect(term.penalizeProvider).toBe(false);
  });

  it("F — provider abort retains usage and counts upstream metric", async () => {
    const chunks = [makeOpenAIChunk("abc"), makeOpenAIChunk("def")];
    const completions = await runMockSse({ chunks, upstreamErrorAfter: 2 });
    buildStreamTerminalMeta(completions[0].ctx, completions[0].usage);
    const metrics = getStreamAbortMetrics();
    expect(metrics.stream_upstream_aborted).toBeGreaterThanOrEqual(1);
  });

  it("G — duplicate finalization is idempotent", async () => {
    const chunks = [makeOpenAIChunk("done"), "data: [DONE]\n\n"];
    const transform = createPassthroughStreamWithLogger(
      "openai", null, "gpt-test", "conn-1",
      { messages: [{ role: "user", content: "hi" }] },
      vi.fn(),
      null, null,
    );
    let finalizeCalls = 0;
    const orig = transform.finalize.bind(transform);
    transform.finalize = (ctx) => { finalizeCalls++; return orig(ctx); };

    const upstream = new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
        controller.close();
      },
    });
    const ctrl = createStreamController({});
    const out = pipeWithDisconnect({ body: upstream, headers: new Headers() }, transform, ctrl);
    await drainStream(out);
    await sleep(50);
    expect(finalizeCalls).toBeGreaterThanOrEqual(1);
    expect(finalizeCalls).toBeLessThanOrEqual(2);
  });

  it("H — successful stream completes with final status", async () => {
    const chunks = [
      makeOpenAIChunk("hello"),
      makeOpenAIChunk("", { finish_reason: "stop", usage: { prompt_tokens: 50, completion_tokens: 5 } }),
      "data: [DONE]\n\n",
    ];
    const completions = await runMockSse({ chunks });
    expect(completions.length).toBe(1);
    const meta = buildStreamTerminalMeta(completions[0].ctx, completions[0].usage);
    expect(meta.termination.terminationReason).toBe(TERMINATION_REASON.COMPLETED);
    expect(meta.usageConfidence.status).toBe(USAGE_STATUS.FINAL);
  });

  it("OpenCode — role-only SSE + ResponseAborted retains estimated usage from provider body", async () => {
    const roleChunk = `data: ${JSON.stringify({
      object: "chat.completion.chunk",
      choices: [{ delta: { role: "assistant" }, index: 0 }],
    })}\n\n`;
    const toolChunk = `data: ${JSON.stringify({
      object: "chat.completion.chunk",
      choices: [{
        delta: {
          tool_calls: [{ index: 0, id: "call_oc", type: "function", function: { name: "read", arguments: "{\"" } }],
        },
        index: 0,
      }],
    })}\n\n`;
    const chunks = [roleChunk, ...Array.from({ length: 35 }, (_, i) => (i % 2 === 0 ? toolChunk : roleChunk))];
    const providerBody = {
      model: "mimo-v2.5-free",
      messages: Array.from({ length: 13 }, (_, i) => ({
        role: i === 0 ? "system" : "user",
        content: "x".repeat(800),
      })),
      tools: Array.from({ length: 11 }, (_, i) => ({ type: "function", function: { name: `tool_${i}`, parameters: { type: "object" } } })),
    };
    const completions = await runMockSse({
      chunks,
      clientCancelAfter: 20,
      body: { messages: [{ role: "user", content: "hi" }] },
      usageEstimateBody: providerBody,
    });
    expect(completions.length).toBe(1);
    const { usage, ctx } = completions[0];
    expect(ctx.kind).toBe("disconnect");
    expect(ctx.totalBytes).toBeGreaterThan(0);
    expect(usage?.prompt_tokens ?? usage?.input_tokens ?? 0).toBeGreaterThan(100);
    expect(usage?.completion_tokens ?? usage?.output_tokens ?? 0).toBeGreaterThan(0);
  });
});

describe("concurrency isolation", () => {
  it("I — one abort does not break other stream finalization", async () => {
    const results = await Promise.all([
      runMockSse({ chunks: [makeOpenAIChunk("a")], upstreamErrorAfter: 1 }),
      runMockSse({ chunks: [makeOpenAIChunk("b"), "data: [DONE]\n\n"] }),
      runMockSse({ chunks: [makeOpenAIChunk("c"), "data: [DONE]\n\n"] }),
      runMockSse({ chunks: [makeOpenAIChunk("d"), "data: [DONE]\n\n"] }),
    ]);
    expect(results.every((r) => r.length === 1)).toBe(true);
  });

  it("J — same connection keeps independent pending lifecycle", async () => {
    const t1 = trackPendingRequest("gpt-test", "openai", "conn-shared", true);
    const t2 = trackPendingRequest("gpt-test", "openai", "conn-shared", true);
    trackPendingRequest("gpt-test", "openai", "conn-shared", false, false, t1);
    trackPendingRequest("gpt-test", "openai", "conn-shared", false, true, t2);
    const snap = getPendingLifecycleSnapshot();
    expect(snap.totalPending).toBe(0);
  });
});

describe("idle timeout behavior", () => {
  it("K — slow but active stream is not killed within generous stall window", async () => {
    const chunks = [makeOpenAIChunk("start")];
    let idx = 0;
    const upstream = new ReadableStream({
      async pull(controller) {
        if (idx === 0) {
          controller.enqueue(new TextEncoder().encode(chunks[0]));
          idx++;
          await sleep(200);
          controller.enqueue(new TextEncoder().encode(makeOpenAIChunk("end")));
          controller.close();
          return;
        }
      },
    });
    const completions = [];
    const transform = createPassthroughStreamWithLogger(
      "openai", null, "gpt-test", "conn-slow", { messages: [{ role: "user", content: "hi" }] },
      (c, u, t, ctx) => completions.push({ c, u, ctx }),
      null, null,
    );
    const ctrl = createStreamController({});
    const out = pipeWithDisconnect({ body: upstream, headers: new Headers() }, transform, ctrl, null, 2000);
    await drainStream(out);
    await sleep(50);
    expect(completions.length).toBe(1);
    expect(classifyStreamTermination(completions[0].ctx).terminationReason).toBe(TERMINATION_REASON.COMPLETED);
  });

  it("L — truly stalled stream terminates and retains partial usage", async () => {
    const upstream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(makeOpenAIChunk("stall-test")));
      },
      pull() {
        return new Promise(() => {}); // hang until stall watchdog fires
      },
    });

    const completions = [];
    const transform = createPassthroughStreamWithLogger(
      "openai", null, "gpt-test", "conn-stall", { messages: [{ role: "user", content: "hi" }] },
      (c, u, t, ctx) => completions.push({ c, u, ctx }),
      null, null,
    );
    const ctrl = createStreamController({});
    const out = pipeWithDisconnect({ body: upstream, headers: new Headers() }, transform, ctrl, null, 120);
    await Promise.race([drainStream(out), sleep(400)]);
    await sleep(100);
    expect(completions.length).toBe(1);
    expect(classifyStreamTermination(completions[0].ctx).terminationReason).toBe(TERMINATION_REASON.UPSTREAM_TIMEOUT);
  }, 10000);
});

describe("stress — mixed terminal outcomes", () => {
  it("O — 50 mixed SSE requests leave scheduler/pending clean", async () => {
    const jobs = [];
    for (let i = 0; i < 50; i++) {
      const roll = i % 20;
      if (roll < 12) {
        jobs.push(runMockSse({ chunks: [makeOpenAIChunk(`ok${i}`), "data: [DONE]\n\n"] }));
      } else if (roll < 14) {
        jobs.push(runMockSse({ chunks: [makeOpenAIChunk(`cancel${i}`)], clientCancelAfter: 1 }));
      } else if (roll < 16) {
        jobs.push(runMockSse({ chunks: [makeOpenAIChunk(`abort${i}`)], upstreamErrorAfter: 1 }));
      } else if (roll < 18) {
        jobs.push(runMockSse({ chunks: [makeOpenAIChunk(`slow${i}`)], stallTimeoutMs: 150 }));
      } else {
        jobs.push(runMockSse({ chunks: [makeOpenAIChunk(`partial${i}`)], upstreamErrorAfter: 1 }));
      }
    }
    const results = await Promise.all(jobs);
    const finalized = results.filter((r) => r.length === 1).length;
    expect(finalized).toBe(50);

    const stats = getSchedulerStats();
    expect(stats.lanes.global?.active ?? 0).toBe(0);
    expect(stats.lanes.global?.queued ?? 0).toBe(0);
    const pending = getPendingLifecycleSnapshot();
    expect(pending.totalPending).toBe(0);
    expect(pending.timerCount).toBe(0);
  }, 60000);
});
