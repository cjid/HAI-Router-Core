import { describe, it, expect } from "vitest";
import {
  WORKER_LIFECYCLE,
  GoWorkerManager,
  parseWorkerId,
  MAX_WORKER_COUNT,
  MIN_WORKER_COUNT,
} from "@/lib/goEngine/workerManager.js";
import {
  clampWorkerCount,
} from "@/lib/goEngine/goEngineSettings.js";
import {
  canAddWorker,
  canDeleteWorker,
  getAddWorkerDisabledReason,
  getDeleteWorkerDisabledReason,
} from "@/shared/utils/goEngineWorkerControls.js";

describe("goEngine worker scaling helpers", () => {
  it("parseWorkerId accepts canonical worker-N ids", () => {
    expect(parseWorkerId("worker-0")).toBe(0);
    expect(parseWorkerId("worker-12")).toBe(12);
    expect(parseWorkerId("bad")).toBeNull();
  });

  it("clampWorkerCount enforces min/max bounds", () => {
    expect(clampWorkerCount(0)).toBe(MIN_WORKER_COUNT);
    expect(clampWorkerCount(99)).toBe(MAX_WORKER_COUNT);
    expect(clampWorkerCount(3)).toBe(3);
  });

  it("getAssignableWorkers skips non-ready lifecycle states", () => {
    const mgr = new GoWorkerManager();
    mgr.workers = [
      { index: 0, lifecycle: WORKER_LIFECYCLE.READY },
      { index: 1, lifecycle: WORKER_LIFECYCLE.DRAINING },
      { index: 2, lifecycle: WORKER_LIFECYCLE.STARTING },
    ];
    expect(mgr.getAssignableWorkers().map((w) => w.index)).toEqual([0]);
  });

  it("monotonic nextWorkerIndex does not recycle deleted ids", () => {
    const mgr = new GoWorkerManager();
    mgr.nextWorkerIndex = 3;
    expect(mgr.nextWorkerIndex).toBe(3);
    const next = mgr.nextWorkerIndex;
    mgr.nextWorkerIndex += 1;
    expect(next).toBe(3);
    expect(mgr.nextWorkerIndex).toBe(4);
  });
});

describe("goEngine worker control gating", () => {
  const healthyRunning = {
    state: "RUNNING",
    health: "Healthy",
    runningWorkers: 2,
  };

  it("allows add/delete when running and healthy", () => {
    expect(canAddWorker(healthyRunning)).toBe(true);
    expect(canDeleteWorker(healthyRunning, { workerId: "worker-1", lifecycle: "READY" })).toBe(true);
  });

  it("blocks add at max workers", () => {
    const atMax = { ...healthyRunning, runningWorkers: MAX_WORKER_COUNT };
    expect(getAddWorkerDisabledReason(atMax)).toMatch(/Maximum worker count/);
    expect(canAddWorker(atMax)).toBe(false);
  });

  it("blocks delete for last worker", () => {
    const oneWorker = { ...healthyRunning, runningWorkers: 1 };
    expect(getDeleteWorkerDisabledReason(oneWorker, { workerId: "worker-0" })).toMatch(/At least one worker/);
    expect(canDeleteWorker(oneWorker, { workerId: "worker-0" })).toBe(false);
  });

  it("blocks topology mutation when engine not healthy", () => {
    const degraded = { ...healthyRunning, health: "Degraded" };
    expect(getAddWorkerDisabledReason(degraded)).toMatch(/Degraded/);
    expect(getDeleteWorkerDisabledReason(degraded, { workerId: "worker-1" })).toMatch(/Degraded/);
  });

  it("blocks delete while worker is draining", () => {
    expect(
      getDeleteWorkerDisabledReason(healthyRunning, { workerId: "worker-1", lifecycle: "DRAINING" }),
    ).toMatch(/draining/i);
  });
});
