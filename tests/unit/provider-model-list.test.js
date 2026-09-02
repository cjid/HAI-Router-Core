import { describe, it, expect } from "vitest";
import {
  supportsModelListForConnection,
  supportsModelListForProvider,
  BUILTIN_MODEL_LIST_PROVIDERS,
} from "@/shared/utils/providerModelListSupport";

describe("providerModelListSupport", () => {
  it("enables fetch for builtin providers", () => {
    expect(BUILTIN_MODEL_LIST_PROVIDERS.has("openrouter")).toBe(true);
    expect(supportsModelListForProvider("openrouter")).toBe(true);
  });

  it("requires baseUrl for compatible providers", () => {
    expect(supportsModelListForConnection({
      provider: "openai-compatible-myapi",
      providerSpecificData: { baseUrl: "https://example.com/v1" },
    })).toBe(true);
    expect(supportsModelListForConnection({
      provider: "openai-compatible-myapi",
      providerSpecificData: {},
    })).toBe(false);
  });

  it("disables unsupported providers", () => {
    expect(supportsModelListForProvider("some-unknown-provider")).toBe(false);
  });
});
