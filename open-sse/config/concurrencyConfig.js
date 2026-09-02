/**
 * Bounded concurrency defaults for SSE/chat admission control.
 * Override via env, dashboard provider safety, or global settings.
 */

import {
  migrateProviderOverrides,
  resolveProviderSafetyKey,
} from "./providerSafetyKeys.js";

const intEnv = (key, fallback) => {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const CONCURRENCY_DEFAULTS = {
  globalMax: intEnv("CONCURRENCY_GLOBAL_MAX", 64),
  providerMax: intEnv("CONCURRENCY_PROVIDER_MAX", 8),
  connectionMax: intEnv("CONCURRENCY_CONNECTION_MAX", 4),
  queueMax: intEnv("CONCURRENCY_QUEUE_MAX", 128),
  queueTimeoutMs: intEnv("CONCURRENCY_QUEUE_TIMEOUT_MS", 10_000),
  fusionMaxParallel: intEnv("CONCURRENCY_FUSION_MAX_PARALLEL", 3),
};

export const MAX_PROVIDER_CONCURRENCY = 64;

/** Env keys that lock providerMax when explicitly set. */
export const PROVIDER_ENV_KEYS = Object.freeze({
  opencode: "CONCURRENCY_OPENCODE_MAX",
  "mimo-free": "CONCURRENCY_MIMO_FREE_MAX",
  mmf: "CONCURRENCY_MIMO_FREE_MAX",
});

/** Product-recommended limits for shared/free upstreams. */
export const PROVIDER_SAFETY_RECOMMENDED = Object.freeze({
  opencode: 1,
  "mimo-free": 2,
  mmf: 2,
});

/** @deprecated use resolveProviderSafety — kept for tests importing old name */
export const PROVIDER_CONCURRENCY_OVERRIDES = Object.freeze({
  opencode: { providerMax: PROVIDER_SAFETY_RECOMMENDED.opencode },
  "mimo-free": { providerMax: PROVIDER_SAFETY_RECOMMENDED["mimo-free"] },
  mmf: { providerMax: PROVIDER_SAFETY_RECOMMENDED.mmf },
});

let runtimeProviderOverrides = {};
let runtimeGlobalProviderMax = CONCURRENCY_DEFAULTS.providerMax;

export function setRuntimeProviderSafety({ providerOverrides, globalProviderMax } = {}) {
  runtimeProviderOverrides = providerOverrides && typeof providerOverrides === "object"
    ? { ...providerOverrides }
    : {};
  if (globalProviderMax != null && Number.isFinite(Number(globalProviderMax))) {
    runtimeGlobalProviderMax = Number(globalProviderMax);
  }
}

export function getRuntimeProviderOverrides() {
  return runtimeProviderOverrides;
}

export function resetRuntimeProviderSafetyForTests() {
  runtimeProviderOverrides = {};
  runtimeGlobalProviderMax = CONCURRENCY_DEFAULTS.providerMax;
}

export function getEnvProviderMax(providerId) {
  const key = PROVIDER_ENV_KEYS[providerId];
  if (!key) return null;
  const v = process.env[key];
  if (v == null || v === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getRecommendedProviderMax(providerId, globalProviderMax = runtimeGlobalProviderMax) {
  if (PROVIDER_SAFETY_RECOMMENDED[providerId] != null) {
    return PROVIDER_SAFETY_RECOMMENDED[providerId];
  }
  return globalProviderMax;
}

export function getCanonicalProviderDefault(providerId, globalProviderMax = runtimeGlobalProviderMax) {
  if (PROVIDER_SAFETY_RECOMMENDED[providerId] != null) {
    return PROVIDER_SAFETY_RECOMMENDED[providerId];
  }
  return globalProviderMax;
}

export function clampProviderMax(value, globalProviderMax = runtimeGlobalProviderMax) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const upper = Math.min(MAX_PROVIDER_CONCURRENCY, globalProviderMax ?? MAX_PROVIDER_CONCURRENCY);
  return Math.min(upper, n);
}

export function resolveProviderSafety(safetyKey, globalProviderMax = runtimeGlobalProviderMax) {
  const recommended = getRecommendedProviderMax(safetyKey, globalProviderMax);
  const canonicalDefault = getCanonicalProviderDefault(safetyKey, globalProviderMax);
  const recommendationNote = PROVIDER_SAFETY_RECOMMENDED[safetyKey] != null
    ? "Shared/free provider"
    : null;

  const envMax = getEnvProviderMax(safetyKey);
  if (envMax != null) {
    return {
      providerId: safetyKey,
      effectiveProviderMax: envMax,
      configuredProviderMax: null,
      recommendedProviderMax: recommended,
      canonicalDefault,
      managedBy: "environment",
      protectionEnabled: true,
      hasOverride: false,
      recommendationNote,
      editable: false,
    };
  }

  const persisted = runtimeProviderOverrides[safetyKey]?.providerMax;
  if (persisted != null) {
    const effective = clampProviderMax(persisted, globalProviderMax) ?? canonicalDefault;
    return {
      providerId: safetyKey,
      effectiveProviderMax: effective,
      configuredProviderMax: effective,
      recommendedProviderMax: recommended,
      canonicalDefault,
      managedBy: "dashboard",
      protectionEnabled: true,
      hasOverride: effective !== canonicalDefault,
      recommendationNote,
      editable: true,
    };
  }

  return {
    providerId: safetyKey,
    effectiveProviderMax: canonicalDefault,
    configuredProviderMax: null,
    recommendedProviderMax: recommended,
    canonicalDefault,
    managedBy: "default",
    protectionEnabled: true,
    hasOverride: false,
    recommendationNote,
    editable: true,
  };
}

export function getProviderConcurrencyOverride(actualProviderId) {
  const safetyKey = resolveProviderSafetyKey(actualProviderId);
  const resolved = resolveProviderSafety(safetyKey, runtimeGlobalProviderMax);
  return { providerMax: resolved.effectiveProviderMax };
}

export function mergeConcurrencySettings(settings = {}) {
  const c = settings?.concurrency || {};
  return {
    globalMax: c.globalMax ?? CONCURRENCY_DEFAULTS.globalMax,
    providerMax: c.providerMax ?? CONCURRENCY_DEFAULTS.providerMax,
    connectionMax: c.connectionMax ?? CONCURRENCY_DEFAULTS.connectionMax,
    queueMax: c.queueMax ?? CONCURRENCY_DEFAULTS.queueMax,
    queueTimeoutMs: c.queueTimeoutMs ?? CONCURRENCY_DEFAULTS.queueTimeoutMs,
    fusionMaxParallel: c.fusionMaxParallel ?? CONCURRENCY_DEFAULTS.fusionMaxParallel,
    providerOverrides: migrateProviderOverrides(c.providerOverrides ?? {}),
  };
}

export { migrateProviderOverrides, providerOverridesNeedsMigration, resolveProviderSafetyKey } from "./providerSafetyKeys.js";
