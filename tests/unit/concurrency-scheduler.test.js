import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  admit,
  configureLanes,
  resetSchedulerStatsForTests,
  resetLanesForTests,
  clearRateLimitGateForTests,
  getSchedulerStats,
  setRateLimitCooldown,
  SchedulerOverloadError,
} from "../../open-sse/concurrency/index.js";
import { resetRuntimeProviderSafetyForTests } from "../../open-sse/config/concurrencyConfig.js";
import { resetConcurrencyPolicyForTests } from "../../src/sse/services/concurrencyPolicy.js";
import { clearKeyedLocksForTests, withKeyedLock } from "../../open-sse/concurrency/keyedMutex.js";
import { parseRetryAfterHeader } from "../../open-sse/utils/error.js";
import { withCredentialRefreshLock } from "../../open-sse/services/oauthCredentialManager.js";
import { trackPendingRequest, getPendingLifecycleSnapshot } from "../../src/lib/db/repos/usageRepo.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resetPendingStore() {
  if (!global._pendingRequests) global._pendingRequests = { byModel: {}, byAccount: {} };
  if (!global._pendingTimers) global._pendingTimers = {};
  global._pendingRequests.byModel = {};
  global._pendingRequests.byAccount = {};
  for (const k of Object.keys(global._pendingTimers)) delete global._pendingTimers[k];
}

beforeEach(() => {
  resetRuntimeProviderSafetyForTests();
  resetConcurrencyPolicyForTests();
  resetLanesForTests({
    globalMax: 5,
    providerMax: 2,
    connectionMax: 2,
    queueMax: 4,
    queueTimeoutMs: 500,
    fusionMaxParallel: 2,
  });
  resetSchedulerStatsForTests();
  clearRateLimitGateForTests();
  clearKeyedLocksForTests();
  resetPendingStore();
});

describe("scheduler — five simultaneous streams", () => {
  it("A allows 5 concurrent admits when capacity permits", async () => {
    resetLanesForTests({
      globalMax: 5,
      providerMax: 5,
      connectionMax: 5,
      queueMax: 4,
      queueTimeoutMs: 2000,
      fusionMaxParallel: 2,
    });
    const tickets = await Promise.all(
      Array.from({ length: 5 }, (_, i) => admit({ providerId: `provider-${i}` })),
    );
    expect(getSchedulerStats().lanes.global.active).toBe(5);
    tickets.forEach((t) => t.release());
    expect(getSchedulerStats().lanes.global.active).toBe(0);
  });
});

describe("scheduler — provider cap", () => {
  it("B queues third request when provider cap is 2", async () => {
    const a = await admit({ providerId: "anthropic" });
    const b = await admit({ providerId: "anthropic" });
    let cStarted = false;
    const cPromise = admit({ providerId: "anthropic" }).then((t) => {
      cStarted = true;
      return t;
    });
    await sleep(30);
    expect(cStarted).toBe(false);
    a.release();
    const c = await cPromise;
    expect(cStarted).toBe(true);
    b.release();
    c.release();
  });
});

describe("scheduler — session fairness", () => {
  it("H prefers admitting queued session with fewer active slots", async () => {
    resetLanesForTests({
      globalMax: 1,
      providerMax: 1,
      connectionMax: 1,
      queueMax: 8,
      queueTimeoutMs: 2000,
      fusionMaxParallel: 2,
    });
    const order = [];
    const a = await admit({ providerId: "fair", sessionId: "session-a" });
    const bPromise = admit({ providerId: "fair", sessionId: "session-b" }).then((t) => {
      order.push("b");
      return t;
    });
    const cPromise = admit({ providerId: "fair", sessionId: "session-c" }).then((t) => {
      order.push("c");
      return t;
    });
    await sleep(20);
    a.release();
    await sleep(30);
    expect(order.length).toBe(1);
    const first = await (order[0] === "b" ? bPromise : cPromise);
    first.release();
    await sleep(20);
    expect(order.length).toBe(2);
    (await (order[0] === "b" ? cPromise : bPromise)).release();
  });
});

describe("scheduler — provider independence", () => {
  it("C provider A full does not block provider B", async () => {
    const a1 = await admit({ providerId: "anthropic" });
    const a2 = await admit({ providerId: "anthropic" });
    const b1 = await admit({ providerId: "openai" });
    expect(b1).toBeTruthy();
    a1.release();
    a2.release();
    b1.release();
  });
});

describe("scheduler — provider cap with sessions", () => {
  it("I only 1 provider slot active for opencode default cap with 3 sessions", async () => {
    resetLanesForTests({
      globalMax: 64,
      providerMax: 8,
      connectionMax: 4,
      queueMax: 8,
      queueTimeoutMs: 500,
      fusionMaxParallel: 3,
    });
    const a = await admit({ providerId: "opencode", sessionId: "sess-a" });
    let secondStarted = false;
    const bPromise = admit({ providerId: "opencode", sessionId: "sess-b" }).then((t) => {
      secondStarted = true;
      return t;
    });
    await sleep(30);
    expect(secondStarted).toBe(false);
    expect(getSchedulerStats().lanes.providers.opencode?.active).toBe(1);
    a.release();
    const b = await bPromise;
    expect(secondStarted).toBe(true);
    b.release();
  });
});

describe("scheduler — queued cancellation", () => {
  it("E abort removes queued entry without starting work", async () => {
    const a = await admit({ providerId: "gemini" });
    const b = await admit({ providerId: "gemini" });
    const ac = new AbortController();
    const cPromise = admit({ providerId: "gemini", signal: ac.signal });
    await sleep(20);
    ac.abort();
    await expect(cPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(getSchedulerStats().lanes.providers.gemini?.queued ?? 0).toBe(0);
    a.release();
    b.release();
  });
});

describe("scheduler — active cancellation", () => {
  it("F abort releases slot for next queued request", async () => {
    const a = await admit({ providerId: "xai" });
    const b = await admit({ providerId: "xai" });
    const ac = new AbortController();
    let cStarted = false;
    const cPromise = admit({ providerId: "xai", signal: ac.signal }).then((t) => {
      cStarted = true;
      return t;
    });
    await sleep(20);
    ac.abort();
    await expect(cPromise).rejects.toMatchObject({ name: "AbortError" });
    a.release();
    await sleep(20);
    const c = await admit({ providerId: "xai" });
    expect(c).toBeTruthy();
    b.release();
    c.release();
  });
});

describe("scheduler — queue bound overload", () => {
  it("L returns overload when active + queue full", async () => {
    resetLanesForTests({
      globalMax: 3,
      providerMax: 3,
      connectionMax: 3,
      queueMax: 2,
      queueTimeoutMs: 2000,
      fusionMaxParallel: 2,
    });
    const held = await Promise.all(
      Array.from({ length: 3 }, () => admit({ providerId: "groq" })),
    );
    const waiting = Array.from({ length: 2 }, () =>
      admit({ providerId: "groq" }).catch((e) => e),
    );
    await sleep(30);
    const overload = await admit({ providerId: "groq" }).catch((e) => e);
    expect(overload).toBeInstanceOf(SchedulerOverloadError);
    held.forEach((t) => t.release());
    await Promise.all(waiting);
  });
});

describe("rate limit gate", () => {
  it("G 429 lane cooldown blocks only scoped provider", async () => {
    setRateLimitCooldown("anthropic", "conn-1", 500);
    await expect(admit({ providerId: "anthropic", connectionId: "conn-1" })).rejects.toMatchObject({ status: 429 });
    const open = await admit({ providerId: "openai" });
    open.release();
  });

  it("parses Retry-After delta seconds and HTTP-date", () => {
    expect(parseRetryAfterHeader("30")?.retryAfterMs).toBe(30_000);
    const future = new Date(Date.now() + 60_000).toUTCString();
    const parsed = parseRetryAfterHeader(future);
    expect(parsed?.retryAfterMs).toBeGreaterThan(50_000);
  });
});

describe("keyed mutex — per-provider selection", () => {
  it("serializes same provider but not different providers", async () => {
    const order = [];
    const p1 = withKeyedLock("provider-select:openai", async () => {
      order.push("openai-start");
      await sleep(50);
      order.push("openai-end");
    });
    const p2 = withKeyedLock("provider-select:anthropic", async () => {
      order.push("anthropic-start");
      await sleep(10);
      order.push("anthropic-end");
    });
    await Promise.all([p1, p2]);
    expect(order.indexOf("anthropic-end")).toBeLessThan(order.indexOf("openai-end"));
  });
});

describe("token refresh single-flight", () => {
  it("H 10 concurrent refreshes same connection → one refresh fn", async () => {
    let refreshCount = 0;
    const credentials = { connectionId: "conn-refresh-test", accessToken: "old" };
    const refreshFn = vi.fn(async () => {
      refreshCount++;
      await sleep(30);
      return { accessToken: "new" };
    });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        withCredentialRefreshLock("github", credentials, refreshFn),
      ),
    );
    expect(refreshCount).toBe(1);
    expect(refreshFn).toHaveBeenCalledTimes(1);
  });
});

describe("usage accounting concurrency", () => {
  it("N multiple same connection/model pending counters stay correct", () => {
    resetPendingStore();

    const t1 = trackPendingRequest("gpt-4", "openai", "c1", true);
    const t2 = trackPendingRequest("gpt-4", "openai", "c1", true);
    expect(getPendingLifecycleSnapshot().totalPending).toBe(2);
    trackPendingRequest("gpt-4", "openai", "c1", false, false, t1);
    expect(getPendingLifecycleSnapshot().totalPending).toBe(1);
    trackPendingRequest("gpt-4", "openai", "c1", false, false, t2);
    expect(getPendingLifecycleSnapshot().totalPending).toBe(0);
    expect(getPendingLifecycleSnapshot().timerCount).toBe(0);
  });
});

describe("SSE stream state isolation", () => {
  it("D streamState objects are independent per request", async () => {
    const { pipeWithDisconnect } = await import("../../open-sse/utils/streamHandler.js");
    const { createStreamController } = await import("../../open-sse/utils/streamHandler.js");

    const mkStream = (label) => {
      const enc = new TextEncoder();
      const body = new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(`data: ${label}\n\n`));
          c.close();
        },
      });
      return new Response(body);
    };

    const states = [{ started: false }, { started: false }, { started: false }];
    const labels = ["AAA", "BBB", "CCC"];
    await Promise.all(labels.map((label, i) => {
      const ctrl = createStreamController({});
      const ts = new TransformStream();
      const out = pipeWithDisconnect(mkStream(label), ts, ctrl, null, 5000, null, states[i]);
      return out.getReader().read();
    }));
    expect(states.map((s) => s.started)).toEqual([true, true, true]);
  });
});

describe("stress — counters return to zero", () => {
  it("active and queued return to 0 after burst", async () => {
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(
        admit({ providerId: "stress" }).then(async (t) => {
          await sleep(5);
          t.release();
        }).catch(() => {}),
      );
    }
    await Promise.all(results);
    await sleep(100);
    expect(getSchedulerStats().lanes.global.active).toBe(0);
    expect(getSchedulerStats().lanes.global.queued).toBe(0);
  });
});
