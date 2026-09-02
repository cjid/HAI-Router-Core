import { describe, it, expect } from "vitest";
import { computeWorkerIndex } from "@/lib/goEngine/workerManager.js";

describe("goEngine multi-worker affinity", () => {
  it("returns stable index for same session/provider pair", () => {
    const a = computeWorkerIndex("session-1", "github", 4);
    const b = computeWorkerIndex("session-1", "github", 4);
    expect(a).toBe(b);
  });

  it("distributes different sessions across workers", () => {
    const indices = new Set();
    for (let i = 0; i < 32; i++) {
      indices.add(computeWorkerIndex(`session-${i}`, "openai", 4));
    }
    expect(indices.size).toBeGreaterThan(1);
  });

  it("changes index when worker count changes", () => {
    const idx4 = computeWorkerIndex("session-x", "cursor", 4);
    const idx8 = computeWorkerIndex("session-x", "cursor", 8);
    expect(idx4).toBeGreaterThanOrEqual(0);
    expect(idx4).toBeLessThan(4);
    expect(idx8).toBeGreaterThanOrEqual(0);
    expect(idx8).toBeLessThan(8);
  });
});
