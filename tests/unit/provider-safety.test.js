import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveProviderSafety,
  resetRuntimeProviderSafetyForTests,
  getEnvProviderMax,
  clampProviderMax,
  migrateProviderOverrides,
} from "../../open-sse/config/concurrencyConfig.js";
import {
  GENERIC_SAFETY_KEY,
  getBuiltInSafetyPolicyKeys,
  isCustomProviderRuntimeId,
  isValidSafetyPolicyKey,
  providerOverridesNeedsMigration,
  resolveProviderSafetyKey,
} from "../../open-sse/config/providerSafetyKeys.js";
import { applyConcurrencyPolicy, resetConcurrencyPolicyForTests } from "../../src/sse/services/concurrencyPolicy.js";
import {
  admit,
  resetLanesForTests,
  clearRateLimitGateForTests,
  getProviderLaneStats,
  setRateLimitCooldown,
  getRateLimitRemainingMs,
} from "../../open-sse/concurrency/index.js";
import { Semaphore } from "../../open-sse/concurrency/semaphore.js";
import { listProviderSafetyOptions } from "../../src/lib/goEngine/providerSafety.js";
import { getProvidersByKind } from "../../src/shared/constants/providers.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("provider safety configuration", () => {
  beforeEach(() => {
    delete process.env.CONCURRENCY_OPENCODE_MAX;
    resetRuntimeProviderSafetyForTests();
    resetConcurrencyPolicyForTests();
    resetLanesForTests({ globalMax: 64, providerMax: 8, connectionMax: 4, queueMax: 8, queueTimeoutMs: 500 });
    clearRateLimitGateForTests();
  });

  afterEach(() => {
    delete process.env.CONCURRENCY_OPENCODE_MAX;
    resetRuntimeProviderSafetyForTests();
    resetConcurrencyPolicyForTests();
  });

  it("defaults opencode effective providerMax to 1", () => {
    const resolved = resolveProviderSafety("opencode", 8);
    expect(resolved.effectiveProviderMax).toBe(1);
    expect(resolved.recommendedProviderMax).toBe(1);
    expect(resolved.managedBy).toBe("default");
  });

  it("uses env override with highest precedence and locks editing", () => {
    process.env.CONCURRENCY_OPENCODE_MAX = "2";
    const resolved = resolveProviderSafety("opencode", 8);
    expect(resolved.effectiveProviderMax).toBe(2);
    expect(resolved.managedBy).toBe("environment");
    expect(resolved.editable).toBe(false);
    expect(getEnvProviderMax("opencode")).toBe(2);
  });

  it("applies persisted dashboard override over canonical default", () => {
    applyConcurrencyPolicy({
      concurrency: {
        providerOverrides: { opencode: { providerMax: 2 } },
      },
    });
    const resolved = resolveProviderSafety("opencode", 8);
    expect(resolved.effectiveProviderMax).toBe(2);
    expect(resolved.managedBy).toBe("dashboard");
    expect(resolved.hasOverride).toBe(true);
  });

  it("keeps provider limits isolated per provider", () => {
    applyConcurrencyPolicy({
      concurrency: {
        providerOverrides: { opencode: { providerMax: 1 }, openrouter: { providerMax: 4 } },
      },
    });
    expect(resolveProviderSafety("opencode", 8).effectiveProviderMax).toBe(1);
    expect(resolveProviderSafety("openrouter", 8).effectiveProviderMax).toBe(4);
  });

  it("reset removes override back to canonical default", () => {
    applyConcurrencyPolicy({ concurrency: { providerOverrides: { opencode: { providerMax: 2 } } } });
    applyConcurrencyPolicy({ concurrency: { providerOverrides: {} } });
    expect(resolveProviderSafety("opencode", 8).effectiveProviderMax).toBe(1);
    expect(resolveProviderSafety("opencode", 8).hasOverride).toBe(false);
  });

  it("lowering providerMax does not interrupt active admits", async () => {
    const baseConcurrency = {
      globalMax: 64,
      providerMax: 8,
      connectionMax: 4,
      queueMax: 8,
      queueTimeoutMs: 500,
      fusionMaxParallel: 3,
    };
    applyConcurrencyPolicy({
      concurrency: {
        ...baseConcurrency,
        providerOverrides: { gemini: { providerMax: 2 } },
      },
    });
    const a = await admit({ providerId: "gemini", sessionId: "s1" });
    const b = await admit({ providerId: "gemini", sessionId: "s2" });
    expect(getProviderLaneStats("gemini")?.active).toBe(2);
    expect(getProviderLaneStats("gemini")?.capacity).toBe(2);

    applyConcurrencyPolicy({
      concurrency: {
        ...baseConcurrency,
        providerOverrides: { gemini: { providerMax: 1 } },
      },
    });
    expect(getProviderLaneStats("gemini")?.active).toBe(2);
    expect(getProviderLaneStats("gemini")?.capacity).toBe(1);

    let thirdStarted = false;
    const cPromise = admit({ providerId: "gemini", sessionId: "s3" }).then((t) => {
      thirdStarted = true;
      return t;
    });
    await sleep(20);
    expect(thirdStarted).toBe(false);

    a.release();
    await sleep(20);
    b.release();
    const c = await cPromise;
    expect(thirdStarted).toBe(true);
    c.release();
  });

  it("reports cooldown health from rate-limit gate", () => {
    setRateLimitCooldown("opencode", null, 5000, "429");
    expect(getRateLimitRemainingMs("opencode", null)).toBeGreaterThan(0);
  });

  it("clamps providerMax to safe bounds", () => {
    expect(clampProviderMax(0, 8)).toBeNull();
    expect(clampProviderMax(999, 8)).toBe(8);
    expect(clampProviderMax(2, 8)).toBe(2);
  });
});

describe("provider safety key normalization", () => {
  it("maps built-in provider IDs to themselves", () => {
    expect(resolveProviderSafetyKey("openrouter")).toBe("openrouter");
    expect(resolveProviderSafetyKey("opencode")).toBe("opencode");
    expect(resolveProviderSafetyKey("anthropic")).toBe("anthropic");
  });

  it("maps custom compatible provider IDs to generic", () => {
    expect(resolveProviderSafetyKey("openai-compatible-chat-abc123")).toBe(GENERIC_SAFETY_KEY);
    expect(resolveProviderSafetyKey("anthropic-compatible-xyz")).toBe(GENERIC_SAFETY_KEY);
    expect(resolveProviderSafetyKey("custom-embedding-node1")).toBe(GENERIC_SAFETY_KEY);
  });

  it("validates canonical safety policy keys only", () => {
    expect(isValidSafetyPolicyKey("openrouter")).toBe(true);
    expect(isValidSafetyPolicyKey(GENERIC_SAFETY_KEY)).toBe(true);
    expect(isValidSafetyPolicyKey("openai-compatible-chat-abc")).toBe(false);
    expect(isValidSafetyPolicyKey("conn-123")).toBe(false);
  });

  it("migrates custom override keys to generic using lowest limit", () => {
    const migrated = migrateProviderOverrides({
      "openai-compatible-chat-a": { providerMax: 4 },
      "openai-compatible-chat-b": { providerMax: 2 },
      openrouter: { providerMax: 3 },
    });
    expect(migrated.generic.providerMax).toBe(2);
    expect(migrated.openrouter.providerMax).toBe(3);
    expect(migrated["openai-compatible-chat-a"]).toBeUndefined();
    expect(providerOverridesNeedsMigration({
      "openai-compatible-chat-a": { providerMax: 4 },
    })).toBe(true);
  });
});

describe("provider safety catalog (registry SSOT)", () => {
  it("lists providers without requiring configured connections", () => {
    const options = listProviderSafetyOptions();
    expect(options.length).toBeGreaterThan(1);
    expect(options.some((o) => o.providerId === "openrouter")).toBe(true);
    expect(options.some((o) => o.providerId === "opencode")).toBe(true);
    expect(options.some((o) => o.providerId === GENERIC_SAFETY_KEY)).toBe(true);
  });

  it("uses registry display name for OpenRouter (not connection name)", () => {
    const openrouter = listProviderSafetyOptions().find((o) => o.providerId === "openrouter");
    expect(openrouter).toBeTruthy();
    expect(openrouter.label).toBe("OpenRouter");
    expect(openrouter.label).not.toBe("HAI-Router");
  });

  it("includes Generic exactly once and no dynamic custom provider rows", () => {
    const options = listProviderSafetyOptions();
    const generic = options.filter((o) => o.providerId === GENERIC_SAFETY_KEY);
    expect(generic).toHaveLength(1);
    expect(generic[0].label).toBe("Generic");
    expect(generic[0].description).toBe("Custom / compatible providers");

    const dynamicCustom = options.filter((o) => isCustomProviderRuntimeId(o.providerId));
    expect(dynamicCustom).toHaveLength(0);
  });

  it("includes every applicable LLM registry provider exactly once", () => {
    const expected = getProvidersByKind("llm").map((p) => p.id);
    const optionIds = listProviderSafetyOptions()
      .filter((o) => o.providerId !== GENERIC_SAFETY_KEY)
      .map((o) => o.providerId);

    expect(new Set(optionIds).size).toBe(optionIds.length);
    for (const id of expected) {
      expect(optionIds).toContain(id);
    }
    expect(optionIds.length).toBe(expected.length);
  });

  it("matches built-in safety policy keys from registry helper", () => {
    const fromCatalog = listProviderSafetyOptions()
      .filter((o) => o.providerId !== GENERIC_SAFETY_KEY)
      .map((o) => o.safetyKey)
      .sort();
    expect(fromCatalog).toEqual(getBuiltInSafetyPolicyKeys().sort());
  });
});

describe("generic custom provider runtime policy", () => {
  beforeEach(() => {
    resetRuntimeProviderSafetyForTests();
    resetConcurrencyPolicyForTests();
    resetLanesForTests({ globalMax: 64, providerMax: 8, connectionMax: 4, queueMax: 8, queueTimeoutMs: 500 });
    clearRateLimitGateForTests();
  });

  afterEach(() => {
    resetRuntimeProviderSafetyForTests();
    resetConcurrencyPolicyForTests();
  });

  it("inherits Generic providerMax on custom runtime lanes", async () => {
    applyConcurrencyPolicy({
      concurrency: { providerOverrides: { [GENERIC_SAFETY_KEY]: { providerMax: 2 } } },
    });
    const ticket = await admit({ providerId: "openai-compatible-chat-test123", sessionId: "s1" });
    expect(getProviderLaneStats("openai-compatible-chat-test123")?.capacity).toBe(2);
    ticket.release();
  });

  it("keeps custom provider lanes isolated while sharing Generic config", async () => {
    applyConcurrencyPolicy({
      concurrency: { providerOverrides: { [GENERIC_SAFETY_KEY]: { providerMax: 2 } } },
    });

    const a1 = await admit({ providerId: "openai-compatible-chat-a", sessionId: "s1" });
    const a2 = await admit({ providerId: "openai-compatible-chat-a", sessionId: "s2" });
    expect(getProviderLaneStats("openai-compatible-chat-a")?.active).toBe(2);

    let bStarted = false;
    const bPromise = admit({ providerId: "openai-compatible-chat-b", sessionId: "s3" }).then((t) => {
      bStarted = true;
      return t;
    });
    await sleep(20);
    expect(bStarted).toBe(true);

    a1.release();
    a2.release();
    (await bPromise).release();
  });

  it("keeps custom provider health isolated from Generic policy bucket", () => {
    setRateLimitCooldown("openai-compatible-chat-a", null, 5000, "429");
    expect(getRateLimitRemainingMs("openai-compatible-chat-a", null)).toBeGreaterThan(0);
    expect(getRateLimitRemainingMs("openai-compatible-chat-b", null)).toBe(0);
  });
});

describe("semaphore setCapacity", () => {
  it("allows active count above lowered capacity until releases complete", async () => {
    const sem = new Semaphore({ capacity: 2, maxQueue: 4, queueTimeoutMs: 200, name: "test" });
    const r1 = await sem.acquire();
    const r2 = await sem.acquire();
    expect(sem.stats.active).toBe(2);
    sem.setCapacity(1);
    expect(sem.stats.active).toBe(2);
    expect(sem.stats.capacity).toBe(1);
    r1();
    r2();
  });
});
