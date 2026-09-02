import { describe, expect, it } from "vitest";
import {
  enrichPickerModelsFromCatalog,
  filterEnabledPickerModels,
} from "../../src/shared/utils/enrichPickerModelsFromCatalog.js";

describe("enrichPickerModelsFromCatalog", () => {
  it("enriches existing configured models without adding catalog-only rows", () => {
    const models = [
      { id: "muse-spark", name: "Muse Spark", value: "oc/muse-spark" },
    ];
    const catalogRows = [
      { modelId: "muse-spark", displayName: "Muse Spark 1.2", reasoning: "yes" },
      { modelId: "repo-only-model", displayName: "Repo Only" },
    ];

    const result = enrichPickerModelsFromCatalog(models, catalogRows, new Set());

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Muse Spark 1.2");
    expect(result[0].meta?.modelId).toBe("muse-spark");
  });

  it("drops disabled models unless kept for an existing selection", () => {
    const models = [
      { id: "enabled-model", value: "oc/enabled-model" },
      { id: "disabled-model", value: "oc/disabled-model" },
    ];

    const filtered = filterEnabledPickerModels(models, new Set(["disabled-model"]), {
      keepValues: ["oc/disabled-model"],
    });

    expect(filtered.map((m) => m.id)).toEqual(["enabled-model", "disabled-model"]);
  });
});
