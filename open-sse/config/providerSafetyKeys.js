/**
 * Provider Safety policy key normalization.
 * Policy keys are global per provider type — not per connection/account.
 */

import REGISTRY from "../providers/registry/index.js";

export const GENERIC_SAFETY_KEY = "generic";

const OPENAI_COMPATIBLE_PREFIX = "openai-compatible-";
const ANTHROPIC_COMPATIBLE_PREFIX = "anthropic-compatible-";
const CUSTOM_EMBEDDING_PREFIX = "custom-embedding-";

function isLlmRoutableRegistryEntry(entry) {
  if (!entry || entry.hidden) return false;
  const kinds = entry.serviceKinds ?? ["llm"];
  return kinds.includes("llm");
}

/** Built-in provider IDs eligible for Provider Safety (chat/SSE admission). */
export function getBuiltInSafetyPolicyKeys() {
  return REGISTRY
    .filter(isLlmRoutableRegistryEntry)
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
    .map((entry) => entry.id);
}

/**
 * Map runtime provider ID → persisted policy key.
 * Custom/compatible nodes share the Generic policy bucket.
 */
export function resolveProviderSafetyKey(providerId) {
  if (!providerId || typeof providerId !== "string") return GENERIC_SAFETY_KEY;
  if (providerId === GENERIC_SAFETY_KEY) return GENERIC_SAFETY_KEY;
  if (
    providerId.startsWith(OPENAI_COMPATIBLE_PREFIX)
    || providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX)
    || providerId.startsWith(CUSTOM_EMBEDDING_PREFIX)
  ) {
    return GENERIC_SAFETY_KEY;
  }
  return providerId;
}

/** True when providerId is a custom runtime lane (not the Generic policy key itself). */
export function isCustomProviderRuntimeId(providerId) {
  return providerId !== GENERIC_SAFETY_KEY
    && resolveProviderSafetyKey(providerId) === GENERIC_SAFETY_KEY;
}

export function isValidSafetyPolicyKey(safetyKey) {
  if (safetyKey === GENERIC_SAFETY_KEY) return true;
  return getBuiltInSafetyPolicyKeys().includes(safetyKey);
}

/**
 * Collapse legacy per-custom-node overrides into Generic (lowest limit wins).
 */
export function migrateProviderOverrides(rawOverrides = {}) {
  if (!rawOverrides || typeof rawOverrides !== "object") return {};

  const next = {};
  const genericCandidates = [];

  for (const [key, val] of Object.entries(rawOverrides)) {
    if (!val || val.providerMax == null) continue;
    const max = Number.parseInt(val.providerMax, 10);
    if (!Number.isFinite(max) || max < 1) continue;

    const safetyKey = resolveProviderSafetyKey(key);
    if (safetyKey === GENERIC_SAFETY_KEY) {
      genericCandidates.push(max);
      continue;
    }

    if (next[safetyKey]?.providerMax != null) {
      next[safetyKey].providerMax = Math.min(next[safetyKey].providerMax, max);
    } else {
      next[safetyKey] = { providerMax: max };
    }
  }

  if (genericCandidates.length > 0) {
    const mergedGeneric = Math.min(
      ...genericCandidates,
      next[GENERIC_SAFETY_KEY]?.providerMax ?? Number.POSITIVE_INFINITY,
    );
    if (Number.isFinite(mergedGeneric)) {
      next[GENERIC_SAFETY_KEY] = { providerMax: mergedGeneric };
    }
  }

  return next;
}

export function providerOverridesNeedsMigration(rawOverrides = {}) {
  const migrated = migrateProviderOverrides(rawOverrides);
  return JSON.stringify(rawOverrides || {}) !== JSON.stringify(migrated);
}
