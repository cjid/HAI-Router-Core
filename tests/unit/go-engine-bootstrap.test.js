import { describe, it, expect, vi, beforeEach } from "vitest";
import { ENGINE_STATES, GoEngineManager } from "@/lib/goEngine/goEngineManager.js";

vi.mock("@/lib/goEngine/workerManager.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isGoEngineEnabled: () => true,
    resolveWorkerBinary: () => "/fake/hai-worker",
    GoWorkerManager: vi.fn(function GoWorkerManagerMock() {
      this.workers = [{ index: 0, baseUrl: "http://127.0.0.1:1", authToken: "t", child: { pid: 1 } }];
      this.start = vi.fn().mockResolvedValue(undefined);
      this.shutdown = vi.fn().mockResolvedValue(undefined);
      this.pickWorker = vi.fn();
    }),
  };
});

describe("GoEngineManager lifecycle flags", () => {
  let mgr;

  beforeEach(() => {
    mgr = new GoEngineManager();
  });

  it("manual stop suppresses autostart until manual start", async () => {
    mgr.state = ENGINE_STATES.RUNNING;
    mgr.workerManager = { shutdown: vi.fn().mockResolvedValue(undefined), workers: [] };
    await mgr.stop({ manual: true });
    expect(mgr.autostartSuppressed).toBe(true);
    expect(mgr.state).toBe(ENGINE_STATES.STOPPED);
  });

  it("manual start clears autostart suppress", async () => {
    mgr.autostartSuppressed = true;
    mgr.state = ENGINE_STATES.STOPPED;
    await mgr.start({ manual: true }).catch(() => {});
    expect(mgr.autostartSuppressed).toBe(false);
  });

  it("shutdown stop does not suppress autostart", async () => {
    mgr.state = ENGINE_STATES.RUNNING;
    mgr.workerManager = { shutdown: vi.fn().mockResolvedValue(undefined), workers: [] };
    await mgr.stop({ manual: false });
    expect(mgr.autostartSuppressed).toBe(false);
    expect(mgr.state).toBe(ENGINE_STATES.STOPPED);
  });

  it("start is idempotent when already RUNNING", async () => {
    mgr.state = ENGINE_STATES.RUNNING;
    mgr.workerManager = { workers: [{ index: 0, baseUrl: "http://127.0.0.1:1", authToken: "t", child: { pid: 1 } }] };
    const status = await mgr.start();
    expect(status.state).toBe(ENGINE_STATES.RUNNING);
  });
});

describe("ensureGoEngineStarted autostart suppress", () => {
  beforeEach(() => {
    global.__haiGoEngineManager = { instance: null, bootPromise: null, shutdownPromise: null };
  });

  it("returns null when autostart suppressed", async () => {
    const { getGoEngineManager, ensureGoEngineStarted } = await import("@/lib/goEngine/goEngineManager.js");
    const mgr = getGoEngineManager();
    mgr.autostartSuppressed = true;
    mgr.state = ENGINE_STATES.STOPPED;
    await expect(ensureGoEngineStarted()).resolves.toBeNull();
  });
});
