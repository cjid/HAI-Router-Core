import { describe, expect, it } from "vitest";
import { enrichModelRecord } from "../../src/shared/utils/modelCatalog.js";
import { resolveModelPickerMeta } from "../../src/shared/utils/resolveModelPickerMeta.js";
import {
  filterModelPickerGroups,
  normalizeSearchText,
  scoreModelEntry,
} from "../../src/shared/utils/modelPickerSearch.js";

describe("modelPickerSearch", () => {
  const sampleGroup = {
    name: "OpenCode",
    alias: "oc",
    providerId: "opencode-go",
    models: [
      { id: "mimo-v2.5-free", name: "MIMO v2.5 Free", value: "oc/mimo-v2.5-free" },
      { id: "big-pickle", name: "big-pickle", value: "oc/big-pickle" },
    ],
  };

  it("normalizes search text case-insensitively", () => {
    expect(normalizeSearchText("Open Router")).toBe("openrouter");
    expect(normalizeSearchText("  MiMo ")).toBe("mimo");
  });

  it("matches model id and display name", () => {
    const byId = scoreModelEntry(sampleGroup.models[0], sampleGroup, "mimo-v2.5-free");
    const byName = scoreModelEntry(sampleGroup.models[0], sampleGroup, "mimo");
    expect(byId.match).toBe(true);
    expect(byName.match).toBe(true);
  });

  it("matches provider name and returns all provider models", () => {
    const scored = scoreModelEntry(sampleGroup.models[0], sampleGroup, "opencode");
    expect(scored.providerMatch).toBe(true);

    const groups = filterModelPickerGroups({ "opencode-go": sampleGroup }, "OpenCode");
    expect(groups).toHaveLength(1);
    expect(groups[0].models).toHaveLength(2);
  });

  it("filters to matching models across providers", () => {
    const groups = filterModelPickerGroups(
      {
        "opencode-go": sampleGroup,
        openrouter: {
          name: "OpenRouter",
          alias: "openrouter",
          models: [{ id: "qwen-3.5", name: "Qwen 3.5", value: "openrouter/qwen-3.5" }],
        },
      },
      "qwen",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].models[0].value).toBe("openrouter/qwen-3.5");
  });
});

describe("resolveModelPickerMeta", () => {
  it("uses enrichModelRecord for provider/model values", () => {
    const direct = enrichModelRecord({
      providerId: "opencode-go",
      modelId: "mimo-v2.5-free",
      displayName: "MIMO v2.5 Free",
    });
    const viaPicker = resolveModelPickerMeta("oc/mimo-v2.5-free");
    expect(viaPicker.reasoning).toBe(direct.reasoning);
    expect(viaPicker.inputModalities).toEqual(direct.inputModalities);
    expect(viaPicker.outputModalities).toEqual(direct.outputModalities);
  });

  it("preserves unknown reasoning without coercing to no", () => {
    const meta = resolveModelPickerMeta("oc/unknown-custom-model-xyz");
    if (meta.reasoning === "unknown") {
      expect(meta.reasoning).toBe("unknown");
    } else {
      expect(["yes", "no", "unknown"]).toContain(meta.reasoning);
    }
  });
});
