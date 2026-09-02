import { describe, it, expect, beforeEach } from "vitest";
import {
  waitForProviderPacing,
  clearProviderPacingForTests,
  PROVIDER_PACING,
} from "../../open-sse/concurrency/providerPacing.js";

describe("providerPacing", () => {
  beforeEach(() => {
    clearProviderPacingForTests();
  });

  it("enforces minimum gap for paced providers", async () => {
    await waitForProviderPacing("opencode");
    const t0 = Date.now();
    await waitForProviderPacing("opencode");
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(PROVIDER_PACING.opencode.minGapMs - 50);
  });

  it("skips pacing for unknown providers", async () => {
    await expect(waitForProviderPacing("openai")).resolves.toBeUndefined();
  });

  it("respects abort signal during pacing wait", async () => {
    await waitForProviderPacing("opencode");
    const ac = new AbortController();
    const p = waitForProviderPacing("opencode", { signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});
