import { describe, it, expect } from "vitest";
import { buildModelCatalogSections } from "../../src/shared/utils/buildModelCatalogSections.js";

describe("buildModelCatalogSections", () => {
  const base = {
    providerId: "opencode",
    providerStorageAlias: "oc",
    providerDisplayAlias: "oc",
    staticModels: [{ id: "built-in", name: "Built In" }],
    customModelRows: [],
    discoveredRows: null,
    disabledModelIds: [],
    suggestedModels: [],
  };

  it("keeps registry and custom models in configuredRows only", () => {
    const { configuredRows, repoRows } = buildModelCatalogSections({
      ...base,
      customModelRows: [{ id: "custom-1", name: "Custom", fullModel: "oc/custom-1" }],
    });
    expect(configuredRows.map((r) => r.modelId).sort()).toEqual(["built-in", "custom-1"]);
    expect(repoRows).toHaveLength(0);
  });

  it("puts fetched models in repoRows when not configured", () => {
    const { configuredRows, repoRows } = buildModelCatalogSections({
      ...base,
      discoveredRows: [{ modelId: "from-api", displayName: "From API", source: "provider" }],
    });
    expect(configuredRows.map((r) => r.modelId)).toEqual(["built-in"]);
    expect(repoRows.map((r) => r.modelId)).toEqual(["from-api"]);
    expect(repoRows[0].catalogSection).toBe("repo-fetched");
  });

  it("enriches configured registry row from discovered metadata without duplicating repo", () => {
    const { configuredRows, repoRows } = buildModelCatalogSections({
      ...base,
      discoveredRows: [{ modelId: "built-in", displayName: "Built In Updated", source: "provider" }],
    });
    expect(configuredRows).toHaveLength(1);
    expect(configuredRows[0].displayName).toBe("Built In Updated");
    expect(configuredRows[0].source).toBe("registry");
    expect(configuredRows[0].catalogSection).toBe("configured");
    expect(repoRows).toHaveLength(0);
  });

  it("marks disabled models in configuredRows", () => {
    const { configuredRows, repoRows } = buildModelCatalogSections({
      ...base,
      disabledModelIds: ["built-in"],
    });
    expect(configuredRows[0].catalogSection).toBe("disabled");
    expect(repoRows).toHaveLength(0);
  });

  it("merges suggested and fetched into repo without overlap with configured", () => {
    const { repoRows } = buildModelCatalogSections({
      ...base,
      disabledModelIds: ["laguna-s-2.1-free"],
      discoveredRows: [{ modelId: "fetched-only", displayName: "Fetched" }],
      suggestedModels: [
        { id: "laguna-s-2.1-free", name: "Laguna" },
        { id: "suggested-only", name: "Suggested" },
      ],
    });
    expect(repoRows.map((r) => r.modelId).sort()).toEqual(["fetched-only", "suggested-only"]);
    expect(repoRows.find((r) => r.modelId === "fetched-only").catalogSection).toBe("repo-fetched");
    expect(repoRows.find((r) => r.modelId === "suggested-only").catalogSection).toBe("repo-suggested");
  });

  it("keeps suggested state when the same id is also fetched", () => {
    const { repoRows } = buildModelCatalogSections({
      ...base,
      staticModels: [],
      discoveredRows: [{ modelId: "shared-id", displayName: "Fetched", source: "provider" }],
      suggestedModels: [{ id: "shared-id", name: "Suggested" }],
    });
    expect(repoRows).toHaveLength(1);
    expect(repoRows[0].catalogSection).toBe("repo-suggested");
    expect(repoRows[0].source).toBe("suggested");
  });
});
