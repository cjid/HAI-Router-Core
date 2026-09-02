import { describe, it, expect } from "vitest";
import { mergeDiscoveredCatalog } from "@/lib/providerModels/mergeCatalog.js";
import { buildCatalogKey } from "@/lib/providerModels/catalogKey.js";

describe("mergeDiscoveredCatalog", () => {
  it("marks missing provider models as unavailable without deleting manual models", () => {
    const existing = [
      { modelId: "a", source: "provider", available: true },
      { modelId: "manual-1", source: "custom", available: true },
    ];
    const fresh = [{ modelId: "b", source: "provider", available: true }];
    const merged = mergeDiscoveredCatalog(existing, fresh);
    const a = merged.find((r) => r.modelId === "a");
    const b = merged.find((r) => r.modelId === "b");
    const manual = merged.find((r) => r.modelId === "manual-1");
    expect(a?.stale).toBe(true);
    expect(a?.available).toBe(false);
    expect(b?.stale).toBe(false);
    expect(manual?.source).toBe("custom");
  });

  it("updates lastSeenAt for models still returned", () => {
    const existing = [{ modelId: "x", source: "provider", lastSeenAt: "2020-01-01T00:00:00.000Z" }];
    const fresh = [{ modelId: "x", source: "provider" }];
    const merged = mergeDiscoveredCatalog(existing, fresh);
    expect(merged[0].lastSeenAt).not.toBe("2020-01-01T00:00:00.000Z");
    expect(merged[0].stale).toBe(false);
  });
});

describe("buildCatalogKey", () => {
  it("isolates cache by connection and endpoint", () => {
    const k1 = buildCatalogKey({ providerId: "ollama-local", connectionId: "c1", endpointIdentity: "http://127.0.0.1:11434" });
    const k2 = buildCatalogKey({ providerId: "ollama-local", connectionId: "c2", endpointIdentity: "http://127.0.0.1:11434" });
    const k3 = buildCatalogKey({ providerId: "ollama-local", connectionId: "c1", endpointIdentity: "http://192.168.1.5:11434" });
    expect(k1).not.toBe(k2);
    expect(k1).not.toBe(k3);
  });
});
