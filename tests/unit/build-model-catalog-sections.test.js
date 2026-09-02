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

  it("keeps only explicitly configured models in configuration and puts static models in Suggested", () => {
    const { configuredRows, repoRows } = buildModelCatalogSections({
      ...base,
      customModelRows: [{ id: "custom-1", name: "Custom", fullModel: "oc/custom-1" }],
    });
    expect(configuredRows.map((r) => r.modelId)).toEqual(["custom-1"]);
    expect(repoRows.map((r) => r.modelId)).toEqual(["built-in"]);
    expect(repoRows[0].catalogSection).toBe("repo-suggested");
  });

  it("puts fetched models in repoRows when not configured", () => {
    const { configuredRows, repoRows } = buildModelCatalogSections({
      ...base,
      discoveredRows: [{ modelId: "from-api", displayName: "From API", source: "provider" }],
    });
    expect(configuredRows).toHaveLength(0);
    expect(repoRows.map((r) => r.modelId).sort()).toEqual(["built-in", "from-api"]);
    expect(repoRows.find((r) => r.modelId === "from-api").catalogSection).toBe("repo-fetched");
    expect(repoRows.find((r) => r.modelId === "built-in").catalogSection).toBe("repo-suggested");
  });

  it("enriches an explicitly configured static model from discovered metadata without duplicating repo", () => {
    const { configuredRows, repoRows } = buildModelCatalogSections({
      ...base,
      customModelRows: [{ id: "built-in", name: "Built In", fullModel: "oc/built-in" }],
      discoveredRows: [{ modelId: "built-in", displayName: "Built In Updated", source: "provider" }],
    });
    expect(configuredRows).toHaveLength(1);
    expect(configuredRows[0].displayName).toBe("Built In Updated");
    expect(configuredRows[0].source).toBe("custom");
    expect(configuredRows[0].catalogSection).toBe("configured");
    expect(repoRows).toHaveLength(0);
  });

  it("marks explicitly configured disabled models in configuredRows", () => {
    const { configuredRows, repoRows } = buildModelCatalogSections({
      ...base,
      customModelRows: [{ id: "built-in", name: "Built In", fullModel: "oc/built-in" }],
      disabledModelIds: ["built-in"],
    });
    expect(configuredRows[0].catalogSection).toBe("disabled");
    expect(repoRows).toHaveLength(0);
  });

  it("does not turn a legacy disabled static model into configured state", () => {
    const { configuredRows, repoRows } = buildModelCatalogSections({
      ...base,
      disabledModelIds: ["built-in"],
    });
    expect(configuredRows).toEqual([]);
    expect(repoRows.map((r) => r.modelId)).toEqual(["built-in"]);
  });

  it("merges suggested and fetched into repo without overlap with configured", () => {
    const { repoRows } = buildModelCatalogSections({
      ...base,
      discoveredRows: [{ modelId: "fetched-only", displayName: "Fetched" }],
      suggestedModels: [
        { id: "laguna-s-2.1-free", name: "Laguna" },
        { id: "suggested-only", name: "Suggested" },
      ],
    });
    expect(repoRows.map((r) => r.modelId).sort()).toEqual(["built-in", "fetched-only", "laguna-s-2.1-free", "suggested-only"]);
    expect(repoRows.find((r) => r.modelId === "fetched-only").catalogSection).toBe("repo-fetched");
    expect(repoRows.find((r) => r.modelId === "suggested-only").catalogSection).toBe("repo-suggested");
  });

  it("returns a removed configured model to its static catalog metadata", () => {
    const configured = buildModelCatalogSections({
      ...base,
      customModelRows: [{ id: "built-in", name: "Built In", fullModel: "oc/built-in" }],
    });
    const removed = buildModelCatalogSections(base);

    expect(configured.configuredRows.map((r) => r.modelId)).toEqual(["built-in"]);
    expect(configured.repoRows).toEqual([]);
    expect(removed.configuredRows).toEqual([]);
    expect(removed.repoRows).toHaveLength(1);
    expect(removed.repoRows[0]).toMatchObject({
      modelId: "built-in",
      displayName: "Built In",
      catalogSection: "repo-suggested",
    });
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
