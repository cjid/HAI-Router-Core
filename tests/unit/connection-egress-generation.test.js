import { describe, it, expect, beforeEach } from "vitest";
import {
  enrichProxyOptions,
  getConnectionEgressGeneration,
  invalidateConnectionEgress,
  resetEgressGenerationsForTests,
} from "@/lib/network/connectionProxy.js";

describe("connection egress generation", () => {
  beforeEach(() => {
    resetEgressGenerationsForTests();
  });

  it("assigns stable generation per connection until invalidated", () => {
    const g1 = getConnectionEgressGeneration("conn-a");
    const g2 = getConnectionEgressGeneration("conn-a");
    const g3 = getConnectionEgressGeneration("conn-b");
    expect(g1).toBe(g2);
    expect(g3).not.toBe(g1);
  });

  it("bumps generation on invalidate", () => {
    const before = getConnectionEgressGeneration("conn-x");
    invalidateConnectionEgress("conn-x");
    const after = getConnectionEgressGeneration("conn-x");
    expect(after).toBeGreaterThan(before);
  });

  it("enrichProxyOptions attaches provider metadata and generation", () => {
    const opts = enrichProxyOptions({
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://127.0.0.1:7890",
    }, { providerId: "github", connectionId: "c1" });

    expect(opts.providerId).toBe("github");
    expect(opts.connectionId).toBe("c1");
    expect(opts.egressGeneration).toBeGreaterThan(0);
  });
});
