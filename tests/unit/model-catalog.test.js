import { describe, it, expect } from "vitest";
import {
  formatContextTokens,
  formatPricePerMillion,
  formatModelPricing,
  resolvePricingStatus,
  resolvePricingTier,
  resolveCatalogPricing,
  enrichModelRecord,
  enrichModelList,
  refreshCatalogRowPricing,
} from "@/shared/utils/modelCatalog";
describe("modelCatalog", () => {
  it("formats context tokens", () => {
    expect(formatContextTokens(128000)).toBe("128K");
    expect(formatContextTokens(1000000)).toBe("1M");
    expect(formatContextTokens(undefined)).toBeNull();
  });

  it("formats pricing per million", () => {
    expect(formatPricePerMillion(3)).toBe("$3.00");
    expect(formatPricePerMillion(0)).toBe("$0.00");
    expect(formatPricePerMillion(undefined)).toBeNull();
  });

  it("bands paid pricing from input USD per 1M", () => {
    expect(resolvePricingTier({ isFree: true }).tier).toBe("free");
    expect(resolvePricingTier({ inputPrice: 0, outputPrice: 0 }).tier).toBe("free");
    expect(resolvePricingTier({ inputPrice: 0.14, outputPrice: 0.28 }).tier).toBe("cheap");
    expect(resolvePricingTier({ inputPrice: 1, outputPrice: 5 }).tier).toBe("cheap");
    expect(resolvePricingTier({ inputPrice: 1.99, outputPrice: 10 }).tier).toBe("cheap");
    expect(resolvePricingTier({ inputPrice: 2, outputPrice: 10 }).tier).toBe("medium");
    expect(resolvePricingTier({ inputPrice: 3, outputPrice: 15 }).tier).toBe("medium");
    expect(resolvePricingTier({ inputPrice: 4.99, outputPrice: 25 }).tier).toBe("medium");
    expect(resolvePricingTier({ inputPrice: 5, outputPrice: 25 }).tier).toBe("expensive");
    expect(resolvePricingTier({ inputPrice: null, outputPrice: null })).toBeNull();
    expect(resolvePricingTier({ providerQuota: true })).toBeNull();
    expect(resolvePricingTier({ outputPrice: 60 })).toBeNull();
  });

  it("distinguishes free vs unknown pricing", () => {
    expect(resolvePricingStatus(0, 0)).toBe("free");
    expect(resolvePricingStatus(null, null)).toBe("unknown");
    expect(formatModelPricing({ inputPrice: null, outputPrice: null }).status).toBe("unknown");
    expect(formatModelPricing({ inputPrice: 0, outputPrice: 0 }).label).toBe("Free");
  });

  it("enriches known registry model without name guessing", () => {
    const row = enrichModelRecord({
      providerId: "openai",
      modelId: "gpt-4o",
      displayName: "GPT-4o",
      source: "registry",
    });
    expect(row.inputModalities).toContain("text");
    expect(row.contextLabel).not.toBe("—");
    expect(row.inputPriceLabel).not.toBe("—");
  });

  it("marks unknown metadata for unfamiliar model ids", () => {
    const row = enrichModelRecord({
      providerId: "openrouter",
      modelId: "totally-unknown-model-xyz-12345",
      source: "provider",
    });
    expect(row.reasoning).toBe("unknown");
    expect(row.inputPriceLabel).toBe("—");
    expect(row.pricingTier).toBeNull();
  });

  it("uses OpenRouter API pricing without global pattern fallback", () => {
    const row = enrichModelRecord({
      providerId: "openrouter",
      modelId: "deepseek/deepseek-v4-flash",
      source: "provider",
      raw: { pricing: { prompt: "0.00000014", completion: "0.00000028" } },
    });
    expect(row.inputPrice).toBeCloseTo(0.14, 2);
    expect(row.outputPrice).toBeCloseTo(0.28, 2);
    expect(row.pricingTier?.tier).toBe("cheap");
    expect(row.providerSnapshot?.pricing).toEqual({
      prompt: "0.00000014",
      completion: "0.00000028",
    });
  });

  it("does not guess pricing for reseller models without provider data", () => {
    const guessed = resolveCatalogPricing("openrouter", "anthropic/claude-sonnet-4", {});
    expect(guessed).toBeNull();
    const row = enrichModelRecord({
      providerId: "openrouter",
      modelId: "anthropic/claude-sonnet-4",
      source: "provider",
    });
    expect(row.inputPriceLabel).toBe("—");
    expect(row.pricingTier).toBeNull();
  });

  it("clears stale guessed pricing when reloading cached reseller rows", () => {
    const refreshed = refreshCatalogRowPricing({
      modelId: "anthropic/claude-sonnet-4",
      inputPrice: 0.14,
      outputPrice: 0.28,
      pricingStatus: "priced",
      inputPriceLabel: "$0.14",
      outputPriceLabel: "$0.28",
    }, "openrouter");
    expect(refreshed.inputPriceLabel).toBe("—");
    expect(refreshed.pricingTier).toBeNull();
  });

  it("enriches model list with stats", () => {
    const { rows, stats } = enrichModelList([
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "unknown-model-xyz", name: "Unknown" },
    ], "openai");
    expect(rows.length).toBe(2);
    expect(stats.total).toBe(2);
  });
});
