import { describe, it, expect, vi, beforeEach } from "vitest";
import { ENGINE_STATES, GoEngineManager } from "@/lib/goEngine/goEngineManager.js";

describe("GoEngineManager aggregateHealth", () => {
  let mgr;

  beforeEach(() => {
    mgr = new GoEngineManager();
  });

  it("returns Healthy when all workers are Healthy in RUNNING state", () => {
    const workers = [{ health: "Healthy" }, { health: "Healthy" }];
    expect(mgr.aggregateHealth(workers, ENGINE_STATES.RUNNING)).toBe("Healthy");
  });

  it("returns Degraded when some workers are unhealthy", () => {
    const workers = [{ health: "Healthy" }, { health: "Unhealthy" }];
    expect(mgr.aggregateHealth(workers, ENGINE_STATES.RUNNING)).toBe("Degraded");
  });

  it("returns Unhealthy when no workers are healthy while running", () => {
    const workers = [{ health: "Unhealthy" }];
    expect(mgr.aggregateHealth(workers, ENGINE_STATES.RUNNING)).toBe("Unhealthy");
  });

  it("returns Stopped when engine state is STOPPED", () => {
    expect(mgr.aggregateHealth([], ENGINE_STATES.STOPPED)).toBe("Stopped");
    expect(mgr.aggregateHealth([{ health: "Healthy" }], ENGINE_STATES.STOPPED)).toBe("Stopped");
  });

  it("returns Paused when engine state is PAUSED", () => {
    const workers = [{ health: "Healthy" }];
    expect(mgr.aggregateHealth(workers, ENGINE_STATES.PAUSED)).toBe("Paused");
  });
});
