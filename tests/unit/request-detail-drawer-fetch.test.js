import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createDetailRequestTracker,
  createTerminalDetailCache,
  fetchRequestDetailById,
  RequestDetailFetchError,
  REQUEST_DETAIL_FETCH_TIMEOUT_MS,
  detailHasFullPayload,
} from "../../src/shared/utils/requestDetailDrawer.js";

/** Reproduce pre-fix race: detailViewId overwritten when selectedDetail cleared on render. */
function simulateBuggyDetailViewRace({ fetchDelayMs = 0 } = {}) {
  let selectedDetail = null;
  let detailViewId = null;
  let detailLoading = false;

  const render = () => {
    detailViewId = selectedDetail?.id ?? null;
  };

  return {
    async open(detail) {
      const viewId = detail.id;
      detailViewId = viewId;
      selectedDetail = null;
      detailLoading = true;
      render();

      if (fetchDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, fetchDelayMs));
      }

      if (detailViewId !== viewId) {
        return { applied: false, detailLoading, selectedDetail, detailViewId };
      }
      selectedDetail = detail;
      if (detailViewId === viewId) detailLoading = false;
      return { applied: true, detailLoading, selectedDetail, detailViewId };
    },
    getState: () => ({ selectedDetail, detailViewId, detailLoading }),
  };
}

/** Fixed flow: active id owned by tracker, summary set before fetch. */
async function simulateFixedDetailViewFlow({
  detail,
  fetchDelayMs = 0,
  fetchResult = null,
  fetchFn,
}) {
  const tracker = createDetailRequestTracker();
  let selectedDetail = null;
  let isLoadingFullDetail = false;
  let fullDetailError = null;

  const req = tracker.startRequest(detail.id);
  selectedDetail = detail;
  isLoadingFullDetail = true;

  if (fetchDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, fetchDelayMs));
  }

  try {
    const full = fetchFn
      ? await fetchFn(detail.id, { signal: req.signal })
      : fetchResult;
    if (!req.isCurrent()) {
      return { selectedDetail, isLoadingFullDetail, fullDetailError, applied: false };
    }
    selectedDetail = full || detail;
  } catch (err) {
    if (!req.isCurrent()) {
      return { selectedDetail, isLoadingFullDetail, fullDetailError, applied: false };
    }
    if (err?.aborted) {
      return { selectedDetail, isLoadingFullDetail, fullDetailError, applied: false };
    }
    fullDetailError = err?.timedOut ? "timeout" : "failed";
  } finally {
    if (req.isCurrent()) isLoadingFullDetail = false;
  }

  return { selectedDetail, isLoadingFullDetail, fullDetailError, applied: true };
}

const summaryRow = (id, overrides = {}) => ({
  id,
  model: "gpt-test",
  provider: "openai",
  status: "success",
  timestamp: new Date().toISOString(),
  tokens: { prompt_tokens: 10, completion_tokens: 5 },
  request: { redacted: true },
  response: { redacted: true },
  ...overrides,
});

describe("request detail drawer — race regression", () => {
  it("buggy flow leaves loading forever when render clears detailViewId", async () => {
    const sim = simulateBuggyDetailViewRace();
    const result = await sim.open(summaryRow("req-a"));
    expect(result.applied).toBe(false);
    expect(result.detailLoading).toBe(true);
    expect(result.selectedDetail).toBeNull();
  });

  it("fixed flow applies detail and clears loading after fetch", async () => {
    const row = summaryRow("req-a");
    const full = { ...row, request: { messages: [] }, response: { content: "hi" } };
    const result = await simulateFixedDetailViewFlow({
      detail: row,
      fetchResult: full,
    });
    expect(result.applied).toBe(true);
    expect(result.isLoadingFullDetail).toBe(false);
    expect(result.selectedDetail).toEqual(full);
    expect(result.fullDetailError).toBeNull();
  });

  it("rapid switch: slow A then fast B — B wins permanently", async () => {
    const tracker = createDetailRequestTracker();
    let selected = null;
    let loading = false;

    const run = async (row, delayMs, label) => {
      const req = tracker.startRequest(row.id);
      selected = row;
      loading = true;
      await new Promise((r) => setTimeout(r, delayMs));
      if (!req.isCurrent()) return label;
      selected = { ...row, label };
      loading = false;
      return label;
    };

    const pA = run(summaryRow("a"), 100, "A");
    await new Promise((r) => setTimeout(r, 5));
    const pB = run(summaryRow("b"), 10, "B");
    await Promise.all([pA, pB]);

    expect(selected.id).toBe("b");
    expect(selected.label).toBe("B");
    expect(loading).toBe(false);
  });

  it("close cancels active request — late response ignored", async () => {
    const tracker = createDetailRequestTracker();
    const req = tracker.startRequest("req-a");
    tracker.cancelActive();
    expect(req.isCurrent()).toBe(false);
    expect(tracker.getActiveId()).toBeNull();
  });
});

describe("fetchRequestDetailById", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns detail on success", async () => {
    const detail = summaryRow("x", { response: { content: "ok" } });
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ detail }),
    }));
    const result = await fetchRequestDetailById("x", { fetchFn, timeoutMs: 5000 });
    expect(result).toEqual(detail);
  });

  it("throws on HTTP error", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await expect(fetchRequestDetailById("x", { fetchFn, timeoutMs: 5000 }))
      .rejects.toMatchObject({ status: 500 });
  });

  it("times out hung fetch", async () => {
    const fetchFn = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      if (signal.aborted) {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        return;
      }
      signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }, { once: true });
    }));
    const promise = fetchRequestDetailById("x", {
      fetchFn,
      timeoutMs: 1000,
    });
    const assertion = expect(promise).rejects.toMatchObject({ timedOut: true });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("aborts when external signal aborts", async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      if (signal.aborted) {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        return;
      }
      signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }, { once: true });
    }));
    const promise = fetchRequestDetailById("x", { fetchFn, signal: controller.signal, timeoutMs: 5000 });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ aborted: true });
  });
});

describe("detail request tracker stress", () => {
  it("open/close cycles do not leak generations beyond bounded cancel", () => {
    const tracker = createDetailRequestTracker();
    for (let i = 0; i < 50; i += 1) {
      const req = tracker.startRequest(`req-${i}`);
      expect(req.isCurrent()).toBe(true);
      tracker.cancelActive();
      expect(req.isCurrent()).toBe(false);
    }
    expect(tracker.getActiveId()).toBeNull();
  });
});

describe("terminal detail cache", () => {
  it("stores terminal details only", () => {
    const cache = createTerminalDetailCache(2);
    cache.set(summaryRow("a", { status: "success", response: { content: "x" } }));
    cache.set(summaryRow("b", { status: "streaming" }));
    expect(cache.get("a")?.response?.content).toBe("x");
    expect(cache.get("b")).toBeNull();
  });

  it("evicts oldest when over max", () => {
    const cache = createTerminalDetailCache(2);
    cache.set(summaryRow("1", { status: "success" }));
    cache.set(summaryRow("2", { status: "completed" }));
    cache.set(summaryRow("3", { status: "success" }));
    expect(cache.get("1")).toBeNull();
    expect(cache.get("2")).toBeTruthy();
    expect(cache.get("3")).toBeTruthy();
  });
});

describe("detailHasFullPayload", () => {
  it("detects redacted list row vs full detail", () => {
    expect(detailHasFullPayload(summaryRow("a"))).toBe(false);
    expect(detailHasFullPayload(summaryRow("a", { response: { content: "hi" } }))).toBe(true);
  });
});

describe("REQUEST_DETAIL_FETCH_TIMEOUT_MS", () => {
  it("allows headroom above SQLite busy_timeout", () => {
    expect(REQUEST_DETAIL_FETCH_TIMEOUT_MS).toBeGreaterThan(5000);
  });
});
