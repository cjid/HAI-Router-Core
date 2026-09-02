import { describe, it, expect, vi, beforeEach } from "vitest";
import { ENGINE_STATES, GoEngineManager } from "@/lib/goEngine/goEngineManager.js";
import { WORKER_LIFECYCLE } from "@/lib/goEngine/workerManager.js";

vi.mock("@/lib/goEngine/goEngineSettings.js", () => ({
  resolveDesiredWorkerCount: vi.fn(async () => 1),
  persistDesiredWorkerCount: vi.fn(async () => {}),
}));

vi.mock("@/lib/db/repos/goEngineEventsRepo.js", () => ({
  appendGoEngineEvent: vi.fn(async () => {}),
  listGoEngineEvents: vi.fn(async () => []),
}));

function makeWorker(index, { lifecycle = WORKER_LIFECYCLE.READY, pid = 1000 + index } = {}) {
  return {
    index,
    addr: `127.0.0.1:${64000 + index}`,
    baseUrl: `http://127.0.0.1:${64000 + index}`,
    authToken: "tok",
    lifecycle,
    child: { pid, kill: vi.fn() },
  };
}

describe("GoEngineManager worker scaling", () => {
  let mgr;

  beforeEach(() => {
    mgr = new GoEngineManager();
    mgr.state = ENGINE_STATES.RUNNING;
    mgr.admissionOpen = true;
    mgr.desiredWorkerCount = 2;
    mgr.desiredWorkerCountLoaded = true;
    mgr.workerManager = {
      workers: [makeWorker(0), makeWorker(2)],
      nextWorkerIndex: 3,
      getAssignableWorkers() {
        return this.workers.filter((w) => w.lifecycle === WORKER_LIFECYCLE.READY);
      },
      findWorker(index) {
        return this.workers.find((w) => w.index === index) || null;
      },
      markDraining(index) {
        const w = this.findWorker(index);
        if (w) w.lifecycle = WORKER_LIFECYCLE.DRAINING;
        return w;
      },
      restoreReady(index) {
        const w = this.findWorker(index);
        if (w) w.lifecycle = WORKER_LIFECYCLE.READY;
        return w;
      },
      terminateWorker: vi.fn(async (index) => {
        mgr.workerManager.workers = mgr.workerManager.workers.filter((w) => w.index !== index);
        return true;
      }),
      addOneWorker: vi.fn(async () => {
        const worker = makeWorker(mgr.workerManager.nextWorkerIndex);
        mgr.workerManager.nextWorkerIndex += 1;
        mgr.workerManager.workers.push(worker);
        return worker;
      }),
    };

    mgr._probeWorker = vi.fn(async () => ({ protocol: "1", worker: "0.1.0" }));
    mgr._fetchWorkerStatus = vi.fn(async () => ({ healthy: true, activeRequests: 0 }));
    mgr.getStatus = vi.fn(async () => ({
      state: mgr.state,
      health: "Healthy",
      runningWorkers: mgr.workerManager.workers.length,
      desiredWorkerCount: mgr.desiredWorkerCount,
      workers: mgr.workerManager.workers.map((w) => ({
        workerId: `worker-${w.index}`,
        health: w.lifecycle === WORKER_LIFECYCLE.DRAINING ? "Draining" : "Healthy",
        lifecycle: w.lifecycle,
        activeRequests: 0,
      })),
    }));
  });

  it("addWorker increments desired count after probe", async () => {
    const status = await mgr.addWorker();
    expect(mgr.workerManager.addOneWorker).toHaveBeenCalledOnce();
    expect(mgr.desiredWorkerCount).toBe(3);
    expect(status.desiredWorkerCount).toBe(3);
  });

  it("removeWorker rejects last worker with minimum_worker_required", async () => {
    mgr.workerManager.workers = [makeWorker(0)];
    mgr.desiredWorkerCount = 1;
    await expect(mgr.removeWorker("worker-0")).rejects.toMatchObject({
      code: "minimum_worker_required",
      status: 409,
    });
  });

  it("removeWorker drains and terminates idle worker", async () => {
    await mgr.removeWorker("worker-2");
    expect(mgr.workerManager.terminateWorker).toHaveBeenCalledWith(2);
    expect(mgr.desiredWorkerCount).toBe(1);
    expect(mgr.workerManager.workers.map((w) => w.index)).toEqual([0]);
  });

  it("removeWorker waits for active requests before terminating", async () => {
    mgr._countActiveForWorker = vi.fn()
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(1)
      .mockReturnValue(0);
    mgr._fetchWorkerStatus = vi.fn(async () => ({ healthy: true, activeRequests: 0 }));

    await mgr.removeWorker("worker-2");
    expect(mgr._countActiveForWorker).toHaveBeenCalled();
    expect(mgr.workerManager.terminateWorker).toHaveBeenCalledWith(2);
  });

  it("removeWorker restores worker on drain timeout", async () => {
    const prev = process.env.HAI_GO_SHUTDOWN_DRAIN_MS;
    process.env.HAI_GO_SHUTDOWN_DRAIN_MS = "50";
    mgr._countActiveForWorker = vi.fn(() => 2);
    mgr._fetchWorkerStatus = vi.fn(async () => ({ healthy: true, activeRequests: 2 }));

    try {
      await expect(mgr.removeWorker("worker-2")).rejects.toMatchObject({ code: "drain_timeout" });
      expect(mgr.workerManager.findWorker(2)?.lifecycle).toBe(WORKER_LIFECYCLE.READY);
      expect(mgr.workerManager.terminateWorker).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.HAI_GO_SHUTDOWN_DRAIN_MS;
      else process.env.HAI_GO_SHUTDOWN_DRAIN_MS = prev;
    }
  });

  it("rejects topology mutation when engine health is not Healthy", async () => {
    mgr.getStatus = vi.fn(async () => ({ state: "RUNNING", health: "Degraded", runningWorkers: 2 }));
    await expect(mgr.addWorker()).rejects.toMatchObject({ code: "engine_not_healthy" });
    await expect(mgr.removeWorker("worker-2")).rejects.toMatchObject({ code: "engine_not_healthy" });
  });
});

describe("GoEngineManager aggregateHealth with draining workers", () => {
  let mgr;

  beforeEach(() => {
    mgr = new GoEngineManager();
  });

  it("returns Healthy when all workers are healthy or draining", () => {
    const workers = [{ health: "Healthy" }, { health: "Draining" }];
    expect(mgr.aggregateHealth(workers, ENGINE_STATES.RUNNING)).toBe("Healthy");
  });

  it("returns Degraded when some workers are unhealthy but one is healthy", () => {
    const workers = [{ health: "Healthy" }, { health: "Unhealthy" }];
    expect(mgr.aggregateHealth(workers, ENGINE_STATES.RUNNING)).toBe("Degraded");
  });
});
