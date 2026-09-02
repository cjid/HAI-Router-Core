import { describe, it, expect, beforeEach } from "vitest";
import {
  getConnectionEgressGeneration,
  invalidateConnectionEgress,
  resetEgressGenerationsForTests,
} from "@/lib/network/connectionProxy.js";

describe("goEngine egress generation immutability", () => {
  beforeEach(() => {
    resetEgressGenerationsForTests();
  });

  it("keeps generation stable across repeated reads", () => {
    const first = getConnectionEgressGeneration("conn-immutable");
    for (let i = 0; i < 20; i++) {
      expect(getConnectionEgressGeneration("conn-immutable")).toBe(first);
    }
  });

  it("bumps generation exactly once per invalidate", () => {
    const g0 = getConnectionEgressGeneration("conn-bump");
    invalidateConnectionEgress("conn-bump");
    const g1 = getConnectionEgressGeneration("conn-bump");
    invalidateConnectionEgress("conn-bump");
    const g2 = getConnectionEgressGeneration("conn-bump");
    expect(g1).toBeGreaterThan(g0);
    expect(g2).toBeGreaterThan(g1);
  });

  it("isolates generation per connection", () => {
    const a = getConnectionEgressGeneration("conn-a");
    const b = getConnectionEgressGeneration("conn-b");
    invalidateConnectionEgress("conn-a");
    const a2 = getConnectionEgressGeneration("conn-a");
    expect(getConnectionEgressGeneration("conn-b")).toBe(b);
    expect(a2).toBeGreaterThan(a);
  });
});
