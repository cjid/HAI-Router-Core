import { describe, it, expect } from "vitest";
import { wrapBackupExport, unwrapBackupImport } from "@/lib/db/backupFormat.js";
import { PRODUCT_ID } from "@/shared/constants/product.js";

const LEGACY_FIXTURE = {
  settings: { fallbackStrategy: "fill-first" },
  providerConnections: [{ id: "c1", provider: "openai", authType: "apikey", isActive: true, data: {} }],
  providerStates: [],
  providerNodes: [],
  proxyPools: [],
  apiKeys: [],
  combos: [],
  modelAliases: {},
  customModels: [],
  mitmAlias: {},
  pricing: {},
};

describe("backup compatibility", () => {
  it("wraps HAI-Router export with canonical metadata", () => {
    const wrapped = wrapBackupExport({ settings: { a: 1 } });
    expect(wrapped.product).toBe(PRODUCT_ID);
    expect(wrapped.schemaVersion).toBeTypeOf("number");
    expect(wrapped.appVersion).toBeTypeOf("string");
    expect(wrapped.exportedAt).toBeTypeOf("string");
    expect(wrapped.settings).toEqual({ a: 1 });
  });

  it("imports legacy 9Router flat backup", () => {
    const { data, meta } = unwrapBackupImport(LEGACY_FIXTURE);
    expect(meta.legacy).toBe(true);
    expect(data.settings.fallbackStrategy).toBe("fill-first");
    expect(data.providerConnections[0].id).toBe("c1");
  });

  it("round-trips HAI-Router backup", () => {
    const wrapped = wrapBackupExport(LEGACY_FIXTURE);
    const { data, meta } = unwrapBackupImport(wrapped);
    expect(meta.legacy).toBe(false);
    expect(meta.product).toBe(PRODUCT_ID);
    expect(data.providerConnections).toHaveLength(1);
  });
});
