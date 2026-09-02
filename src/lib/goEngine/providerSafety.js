import { getProvidersByKind } from "@/shared/constants/providers.js";
import { getSettings, updateSettings } from "@/lib/db/repos/settingsRepo.js";
import { applyConcurrencyPolicy } from "@/sse/services/concurrencyPolicy.js";
import {
  clampProviderMax,
  getCanonicalProviderDefault,
  getRecommendedProviderMax,
  MAX_PROVIDER_CONCURRENCY,
  mergeConcurrencySettings,
  resolveProviderSafety,
} from "open-sse/config/concurrencyConfig.js";
import {
  GENERIC_SAFETY_KEY,
  isCustomProviderRuntimeId,
  isValidSafetyPolicyKey,
  migrateProviderOverrides,
  providerOverridesNeedsMigration,
  resolveProviderSafetyKey,
} from "open-sse/config/providerSafetyKeys.js";
import {
  getProviderLaneStats,
  getRateLimitRemainingMs,
  getRateLimitStats,
} from "open-sse/concurrency/index.js";
import { getAllLaneStats } from "open-sse/concurrency/laneRegistry.js";

function logProviderSafety(event, message, extra = {}) {
  const parts = [`[PROVIDER:SAFETY] event=${event}`, message];
  if (extra.providerId) parts.push(`provider=${extra.providerId}`);
  console.info(parts.join(" "));
}

function buildRegistryProviderOption(provider) {
  return {
    providerId: provider.id,
    safetyKey: provider.id,
    label: provider.name || provider.id,
    description: provider.id,
    icon: provider.icon || null,
  };
}

/** Registry-based provider catalog — independent of configured connections. */
export function listProviderSafetyOptions() {
  const builtIns = getProvidersByKind("llm").map(buildRegistryProviderOption);
  builtIns.push({
    providerId: GENERIC_SAFETY_KEY,
    safetyKey: GENERIC_SAFETY_KEY,
    label: "Generic",
    description: "Custom / compatible providers",
    icon: "lan",
  });
  return builtIns;
}

function resolveBuiltInProviderHealth(providerId) {
  const remainingMs = getRateLimitRemainingMs(providerId, null);
  if (remainingMs > 0) {
    const stats = getRateLimitStats().find((e) => e.providerId === providerId);
    const reason = stats?.reason || "429";
    const label = reason.includes("429") || reason === "429" ? "Rate Limited" : "Cooling Down";
    return {
      health: label,
      cooldownRemainingMs: remainingMs,
      cooldownUntil: new Date(Date.now() + remainingMs).toISOString(),
      lastFailure: `${label.toLowerCase()} · active cooldown`,
    };
  }

  const lane = getProviderLaneStats(providerId);
  if (lane && lane.active >= lane.capacity && lane.queued > 0) {
    return { health: "Saturated", cooldownRemainingMs: 0, cooldownUntil: null, lastFailure: "At capacity — requests queuing" };
  }

  return { health: "Healthy", cooldownRemainingMs: 0, cooldownUntil: null, lastFailure: null };
}

function resolveGenericProviderHealth() {
  const customIds = Object.keys(getAllLaneStats().providers || {})
    .filter((id) => isCustomProviderRuntimeId(id));

  if (customIds.length === 0) {
    return {
      health: "N/A",
      cooldownRemainingMs: 0,
      cooldownUntil: null,
      lastFailure: null,
    };
  }

  let anyCooldown = false;
  let maxRemaining = 0;
  for (const id of customIds) {
    const remaining = getRateLimitRemainingMs(id, null);
    if (remaining > 0) {
      anyCooldown = true;
      maxRemaining = Math.max(maxRemaining, remaining);
    }
  }

  if (anyCooldown) {
    return {
      health: "Mixed",
      cooldownRemainingMs: maxRemaining,
      cooldownUntil: maxRemaining > 0 ? new Date(Date.now() + maxRemaining).toISOString() : null,
      lastFailure: "Some custom providers in cooldown",
    };
  }

  return {
    health: "Runtime-based",
    cooldownRemainingMs: 0,
    cooldownUntil: null,
    lastFailure: null,
  };
}

function resolveLaneStatsForPolicy(safetyKey) {
  if (safetyKey === GENERIC_SAFETY_KEY) {
    const customEntries = Object.entries(getAllLaneStats().providers || {})
      .filter(([id]) => isCustomProviderRuntimeId(id));
    return {
      active: customEntries.reduce((sum, [, stats]) => sum + (stats?.active ?? 0), 0),
      queued: customEntries.reduce((sum, [, stats]) => sum + (stats?.queued ?? 0), 0),
    };
  }

  const lane = getProviderLaneStats(safetyKey);
  return {
    active: lane?.active ?? 0,
    queued: lane?.queued ?? 0,
  };
}

async function ensureProviderOverridesMigrated(settings) {
  const raw = settings?.concurrency?.providerOverrides ?? {};
  if (!providerOverridesNeedsMigration(raw)) return settings;

  const migrated = migrateProviderOverrides(raw);
  logProviderSafety(
    "provider_overrides_migrated",
    `keys=${Object.keys(raw).join(",") || "(none)"}→${Object.keys(migrated).join(",") || "(none)"}`,
  );

  return updateSettings({
    concurrency: {
      ...settings.concurrency,
      providerOverrides: migrated,
    },
  });
}

function assertValidSafetyPolicyKey(safetyKey) {
  if (!isValidSafetyPolicyKey(safetyKey)) {
    const err = new Error(`Unknown provider safety key: ${safetyKey}`);
    err.code = "invalid_provider";
    err.status = 400;
    throw err;
  }
}

export async function getProviderSafetySnapshot(selectedProviderId, settings = null) {
  const safetyKey = resolveProviderSafetyKey(selectedProviderId);
  assertValidSafetyPolicyKey(safetyKey);

  let resolvedSettings = settings || await getSettings();
  resolvedSettings = await ensureProviderOverridesMigrated(resolvedSettings);
  await applyConcurrencyPolicy(resolvedSettings);

  const merged = mergeConcurrencySettings(resolvedSettings);
  const policy = resolveProviderSafety(safetyKey, merged.providerMax);
  const laneStats = resolveLaneStatsForPolicy(safetyKey);
  const health = safetyKey === GENERIC_SAFETY_KEY
    ? resolveGenericProviderHealth()
    : resolveBuiltInProviderHealth(safetyKey);
  const maxAllowed = Math.min(MAX_PROVIDER_CONCURRENCY, merged.providerMax);

  return {
    providerId: safetyKey,
    safetyKey,
    ...policy,
    active: laneStats.active,
    queued: laneStats.queued,
    limit: policy.effectiveProviderMax,
    maxAllowed,
    providerHealth: health.health,
    cooldownRemainingMs: health.cooldownRemainingMs,
    cooldownUntil: health.cooldownUntil,
    lastFailure: health.lastFailure,
    queueMax: merged.queueMax,
    queueTimeoutMs: merged.queueTimeoutMs,
  };
}

export async function updateProviderSafetyLimit(selectedProviderId, providerMax) {
  const safetyKey = resolveProviderSafetyKey(selectedProviderId);
  if (!safetyKey) {
    const err = new Error("providerId is required");
    err.code = "invalid_provider";
    err.status = 400;
    throw err;
  }
  assertValidSafetyPolicyKey(safetyKey);

  let settings = await getSettings();
  settings = await ensureProviderOverridesMigrated(settings);
  const merged = mergeConcurrencySettings(settings);
  const current = resolveProviderSafety(safetyKey, merged.providerMax);

  if (!current.editable) {
    const err = new Error("Provider concurrency is managed by environment configuration");
    err.code = "provider_safety_locked";
    err.status = 409;
    throw err;
  }

  const clamped = clampProviderMax(providerMax, merged.providerMax);
  if (clamped == null) {
    const err = new Error("providerMax must be a positive integer");
    err.code = "invalid_provider_max";
    err.status = 400;
    throw err;
  }

  const canonical = getCanonicalProviderDefault(safetyKey, merged.providerMax);
  const overrides = { ...(merged.providerOverrides || {}) };

  if (clamped === canonical) {
    delete overrides[safetyKey];
  } else {
    overrides[safetyKey] = { providerMax: clamped };
  }

  const updated = await updateSettings({
    concurrency: {
      ...settings.concurrency,
      providerOverrides: overrides,
    },
  });
  applyConcurrencyPolicy(updated);

  const oldLimit = current.effectiveProviderMax;
  logProviderSafety(
    "provider_safety_updated",
    `providerMax=${oldLimit}→${clamped} source=dashboard`,
    { providerId: safetyKey },
  );

  return getProviderSafetySnapshot(safetyKey, updated);
}

export async function resetProviderSafetyLimit(selectedProviderId) {
  const safetyKey = resolveProviderSafetyKey(selectedProviderId);
  assertValidSafetyPolicyKey(safetyKey);

  let settings = await getSettings();
  settings = await ensureProviderOverridesMigrated(settings);
  const merged = mergeConcurrencySettings(settings);
  const current = resolveProviderSafety(safetyKey, merged.providerMax);

  if (!current.editable) {
    const err = new Error("Provider concurrency is managed by environment configuration");
    err.code = "provider_safety_locked";
    err.status = 409;
    throw err;
  }

  const overrides = { ...(merged.providerOverrides || {}) };
  delete overrides[safetyKey];

  const updated = await updateSettings({
    concurrency: {
      ...settings.concurrency,
      providerOverrides: overrides,
    },
  });
  applyConcurrencyPolicy(updated);

  const canonical = getCanonicalProviderDefault(safetyKey, merged.providerMax);
  logProviderSafety(
    "provider_safety_updated",
    `providerMax=${current.effectiveProviderMax}→${canonical} source=reset`,
    { providerId: safetyKey },
  );

  return getProviderSafetySnapshot(safetyKey, updated);
}

export { getRecommendedProviderMax, resolveProviderSafety, resolveProviderSafetyKey };
