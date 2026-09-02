import { describe, expect, it } from "vitest";
import {
  getCapacityAdapterConfig,
  getCapacityAdapterModels,
} from "../../open-sse/services/capacityAdapter.js";

describe("capacityAdapter empty pool", () => {
  it("getCapacityAdapterConfig does not inject a default model when pool is empty", () => {
    const settings = {
      capacityAdapter: {
        vision: { enabled: true, roundRobin: false, models: [] },
      },
    };
    expect(getCapacityAdapterConfig("vision", settings)).toEqual({
      enabled: true,
      roundRobin: false,
      models: [],
    });
  });

  it("getCapacityAdapterModels skips enabled caps with no models", () => {
    const settings = {
      capacityAdapter: {
        vision: { enabled: true, roundRobin: false, models: [] },
        audioInput: { enabled: true, roundRobin: false, models: ["oc/audio-model"] },
      },
    };
    expect(getCapacityAdapterModels(settings)).toEqual(["oc/audio-model"]);
  });
});
