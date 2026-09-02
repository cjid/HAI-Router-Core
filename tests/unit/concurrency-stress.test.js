import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  admit,
  resetSchedulerStatsForTests,
  resetLanesForTests,
  clearRateLimitGateForTests,
  getSchedulerStats,
  setRateLimitCooldown,
  RateLimitCooldownError,
} from "../../open-sse/concurrency/index.js";
import {
  trackPendingRequest,
  getPendingLifecycleSnapshot,
} from "../../src/lib/db/repos/usageRepo.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resetPendingStore() {
  if (!global._pendingRequests) global._pendingRequests = { byModel: {}, byAccount: {} };
  if (!global._pendingTimers) global._pendingTimers = {};
  global._pendingRequests.byModel = {};
  global._pendingRequests.byAccount = {};
  for (const k of Object.keys(global._pendingTimers)) delete global._pendingTimers[k];
}

function assertSchedulerClean() {
  const stats = getSchedulerStats();
  expect(stats.lanes.global?.active ?? 0).toBe(0);
  expect(stats.lanes.global?.queued ?? 0).toBe(0);
  for (const p of Object.values(stats.lanes.providers || {})) {
    expect(p.active).toBe(0);
    expect(p.queued).toBe(0);
  }
  for (const c of Object.values(stats.lanes.connections || {})) {
    expect(c.active).toBe(0);
    expect(c.queued).toBe(0);
  }
}

function assertPendingClean() {
  const snap = getPendingLifecycleSnapshot();
  expect(snap.totalPending).toBe(0);
  expect(snap.timerCount).toBe(0);
  expect(Object.keys(snap.byModel)).toHaveLength(0);
  expect(Object.keys(snap.byAccount)).toHaveLength(0);
}

function assertAllClean() {
  assertSchedulerClean();
  assertPendingClean();
}

/** Minimal SSE lifecycle: admit → pending → work → cleanup. */
async function mockSseLifecycle({
  providerId = "openai",
  connectionId = null,
  bindLater = false,
  workMs = 20,
  signal = null,
  failMidStream = false,
} = {}) {
  const ticket = await admit({ providerId, connectionId: bindLater ? null : connectionId, signal });
  if (bindLater && connectionId) await ticket.bindConnection(connectionId);
  const token = trackPendingRequest("gpt-test", providerId, connectionId, true);
  try {
    await sleep(workMs);
    if (failMidStream) throw new Error("partial upstream failure");
    await sleep(workMs);
  } finally {
    trackPendingRequest("gpt-test", providerId, connectionId, false, failMidStream, token);
    ticket.release();
  }
}

beforeEach(() => {
  resetLanesForTests({
    globalMax: 5,
    providerMax: 5,
    connectionMax: 4,
    queueMax: 16,
    queueTimeoutMs: 3000,
    fusionMaxParallel: 3,
  });
  resetSchedulerStatsForTests();
  clearRateLimitGateForTests();
  resetPendingStore();
});

describe("admission ordering", () => {
  it("global → provider → connection (eager connectionId)", async () => {
    resetLanesForTests({
      globalMax: 1,
      providerMax: 1,
      connectionMax: 1,
      queueMax: 4,
      queueTimeoutMs: 2000,
      fusionMaxParallel: 2,
    });

    const first = await admit({ providerId: "openai", connectionId: "conn-order" });
    expect(getSchedulerStats().lanes.global.active).toBe(1);
    expect(getSchedulerStats().lanes.providers.openai.active).toBe(1);
    expect(getSchedulerStats().lanes.connections["conn-order"].active).toBe(1);

    let secondStarted = false;
    const second = admit({ providerId: "openai", connectionId: "conn-other" }).then((t) => {
      secondStarted = true;
      return t;
    });
    await sleep(40);
    expect(secondStarted).toBe(false);

    first.release();
    const t2 = await second;
    expect(secondStarted).toBe(true);
    t2.release();
    assertAllClean();
  });

  it("bindConnection acquires connection lane after global+provider", async () => {
    resetLanesForTests({
      globalMax: 5,
      providerMax: 5,
      connectionMax: 1,
      queueMax: 4,
      queueTimeoutMs: 2000,
      fusionMaxParallel: 2,
    });

    const t1 = await admit({ providerId: "anthropic" });
    await t1.bindConnection("conn-bind");
    expect(getSchedulerStats().lanes.connections["conn-bind"].active).toBe(1);

    let t2Bound = false;
    const t2Promise = (async () => {
      const t = await admit({ providerId: "anthropic" });
      await t.bindConnection("conn-bind");
      t2Bound = true;
      return t;
    })();
    await sleep(40);
    expect(t2Bound).toBe(false);

    t1.release();
    const t2 = await t2Promise;
    expect(t2Bound).toBe(true);
    t2.release();
    assertAllClean();
  });
});

describe("connection-scoped admission", () => {
  it("5 same-connection: 4 active + 1 queued when connectionMax=4", async () => {
    resetLanesForTests({
      globalMax: 10,
      providerMax: 10,
      connectionMax: 4,
      queueMax: 8,
      queueTimeoutMs: 3000,
      fusionMaxParallel: 3,
    });

    const conn = "shared-conn";
    const held = [];
    for (let i = 0; i < 4; i++) {
      held.push(await admit({ providerId: "openai", connectionId: conn }));
    }
    expect(getSchedulerStats().lanes.connections[conn].active).toBe(4);

    let fifthStarted = false;
    const fifthPromise = admit({ providerId: "openai", connectionId: conn }).then((t) => {
      fifthStarted = true;
      return t;
    });
    await sleep(50);
    expect(fifthStarted).toBe(false);

    held[0].release();
    const fifth = await fifthPromise;
    expect(fifthStarted).toBe(true);

    for (const t of held.slice(1)) t.release();
    fifth.release();
    assertAllClean();
  });

  it("5 multi-connection: all proceed when each has its own connection lane", async () => {
    resetLanesForTests({
      globalMax: 10,
      providerMax: 10,
      connectionMax: 2,
      queueMax: 8,
      queueTimeoutMs: 3000,
      fusionMaxParallel: 3,
    });

    const tickets = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        admit({ providerId: "openai", connectionId: `conn-${i}` }),
      ),
    );
    expect(tickets).toHaveLength(5);
    expect(getSchedulerStats().lanes.global.active).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(getSchedulerStats().lanes.connections[`conn-${i}`].active).toBe(1);
    }
    tickets.forEach((t) => t.release());
    assertAllClean();
  });
});

describe("long mock SSE stress", () => {
  it("50 requests with active cap 5 — clean after completion", async () => {
    resetLanesForTests({
      globalMax: 5,
      providerMax: 5,
      connectionMax: 4,
      queueMax: 50,
      queueTimeoutMs: 8000,
      fusionMaxParallel: 3,
    });

    let peakActive = 0;
    const monitor = setInterval(() => {
      peakActive = Math.max(peakActive, getSchedulerStats().lanes.global.active);
    }, 5);

    const jobs = Array.from({ length: 50 }, (_, i) =>
      mockSseLifecycle({
        providerId: "stress-prov",
        connectionId: `conn-${i % 8}`,
        workMs: 10 + (i % 5) * 8,
      }),
    );
    await Promise.all(jobs);
    clearInterval(monitor);

    expect(peakActive).toBeLessThanOrEqual(5);
    expect(peakActive).toBeGreaterThanOrEqual(4);
    await sleep(50);
    assertAllClean();
  }, 30_000);

  it("slow streams + rapid cancels — no slot/timer leak", async () => {
    resetLanesForTests({
      globalMax: 5,
      providerMax: 5,
      connectionMax: 3,
      queueMax: 12,
      queueTimeoutMs: 4000,
      fusionMaxParallel: 3,
    });

    const slow = Array.from({ length: 8 }, (_, i) =>
      mockSseLifecycle({
        providerId: "slow",
        connectionId: `slow-${i % 3}`,
        workMs: 80,
      }),
    );

    const cancels = Array.from({ length: 12 }, () => {
      const ac = new AbortController();
      const p = admit({ providerId: "slow", connectionId: "cancel-conn", signal: ac.signal })
        .then((t) => {
          trackPendingRequest("m", "slow", "cancel-conn", true);
          return t;
        })
        .catch(() => null);
      setTimeout(() => ac.abort(), Math.random() * 15);
      return p;
    });

    await Promise.allSettled([...slow, ...cancels]);
    await sleep(100);
    assertAllClean();
  }, 30_000);

  it("429 injection — scoped cooldown then recovery", async () => {
    setRateLimitCooldown("ratey", "conn-429", 120);
    await expect(admit({ providerId: "ratey", connectionId: "conn-429" }))
      .rejects.toBeInstanceOf(RateLimitCooldownError);

    const ok = await admit({ providerId: "other", connectionId: "conn-429" });
    ok.release();

    await sleep(150);
    const recovered = await admit({ providerId: "ratey", connectionId: "conn-429" });
    recovered.release();
    assertAllClean();
  });

  it("partial failures mid-stream still release permits and pending", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        mockSseLifecycle({
          providerId: "partial",
          connectionId: `p-${i % 4}`,
          workMs: 5,
          failMidStream: i % 3 === 0,
        }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected");
    expect(failed.length).toBeGreaterThan(0);
    await sleep(50);
    assertAllClean();
  });

  it("20-request burst with bindConnection path matches chat.js flow", async () => {
    resetLanesForTests({
      globalMax: 5,
      providerMax: 5,
      connectionMax: 2,
      queueMax: 30,
      queueTimeoutMs: 8000,
      fusionMaxParallel: 3,
    });

    await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        const ticket = await admit({ providerId: "bind-flow" });
        await ticket.bindConnection(`bf-${i % 6}`);
        const token = trackPendingRequest("m", "bind-flow", `bf-${i % 6}`, true);
        await sleep(8);
        trackPendingRequest("m", "bind-flow", `bf-${i % 6}`, false, false, token);
        ticket.release();
      }),
    );
    assertAllClean();
  }, 20_000);
});
