import { describe, it, expect } from "vitest";
import { computeWorkerIndex, GoWorkerManager, WORKER_LIFECYCLE } from "@/lib/goEngine/workerManager.js";

describe("goEngine session-aware worker affinity", () => {
  it("distributes different sessions across workers", () => {
    const indices = new Set();
    for (let i = 0; i < 48; i++) {
      indices.add(computeWorkerIndex(`session-${i}`, "opencode", 3, "direct"));
    }
    expect(indices.size).toBeGreaterThan(1);
  });

  it("keeps same session stable on same worker", () => {
    const a = computeWorkerIndex("session-stable", "opencode", 4, "direct");
    const b = computeWorkerIndex("session-stable", "opencode", 4, "direct");
    expect(a).toBe(b);
  });

  it("different sessions on same provider can map to different workers", () => {
    const a = computeWorkerIndex("session-a", "opencode", 3, "direct");
    const b = computeWorkerIndex("session-b", "opencode", 3, "direct");
    const c = computeWorkerIndex("session-c", "opencode", 3, "direct");
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });

  it("spills to least-loaded worker when preferred is hot", () => {
    const mgr = new GoWorkerManager({ workerCount: 3 });
    mgr.workers = [
      { index: 0, addr: "127.0.0.1:1", lifecycle: WORKER_LIFECYCLE.READY },
      { index: 1, addr: "127.0.0.1:2", lifecycle: WORKER_LIFECYCLE.READY },
      { index: 2, addr: "127.0.0.1:3", lifecycle: WORKER_LIFECYCLE.READY },
    ];
    const preferred = computeWorkerIndex("session-x", "opencode", 3, "direct");
    const loadByWorkerId = new Map([
      [`worker-${preferred}`, 10],
      ["worker-0", preferred === 0 ? 10 : 0],
      ["worker-1", preferred === 1 ? 10 : 0],
      ["worker-2", preferred === 2 ? 10 : 1],
    ]);
    const picked = mgr.pickWorker({
      sessionId: "session-x",
      providerId: "opencode",
      egressMode: "direct",
      loadByWorkerId,
    });
    expect(picked.index).not.toBe(preferred);
    expect(picked.index).toBe(0 === preferred ? 1 : 0);
  });
});
