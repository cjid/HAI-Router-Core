import { describe, expect, it } from "vitest";
import {
  filterConnectionsForPicker,
  isProviderEnabled,
} from "../../src/shared/utils/providerEnablement.js";

describe("providerEnablement", () => {
  it("treats missing providerStates as enabled", () => {
    expect(isProviderEnabled("mimo-free", {})).toBe(true);
    expect(isProviderEnabled("openrouter", undefined)).toBe(true);
  });

  it("respects explicit provider disable flag", () => {
    expect(isProviderEnabled("mimo-free", { "mimo-free": false })).toBe(false);
    expect(isProviderEnabled("opencode", { opencode: false })).toBe(false);
  });

  it("filters inactive connections and disabled providers", () => {
    const connections = [
      { id: "1", provider: "opencode", isActive: true },
      { id: "2", provider: "openrouter", isActive: false },
      { id: "3", provider: "mimo-free", isActive: true },
    ];
    const states = { "mimo-free": false };

    expect(filterConnectionsForPicker(connections, states)).toEqual([
      { id: "1", provider: "opencode", isActive: true },
    ]);
  });
});
