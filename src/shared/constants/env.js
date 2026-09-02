import { PRODUCT } from "./product.js";

/**
 * Canonical HAI-Router environment variables.
 * Legacy names are read-only fallbacks — docs mention canonical names only.
 */
export const ENV_KEYS = Object.freeze({
  dataDir: `${PRODUCT.envPrefix}DATA_DIR`,
  instanceName: `${PRODUCT.envPrefix}INSTANCE_NAME`,
  productName: `${PRODUCT.envPrefix}PRODUCT_NAME`,
});

/** @deprecated read-only */
export const LEGACY_ENV_KEYS = Object.freeze({
  dataDir: "DATA_DIR",
  legacyDataDir: "LEGACY_9ROUTER_DATA_DIR",
  instanceName: "INSTANCE_NAME",
});

/** Resolve configured data directory from env (canonical first). */
export function resolveConfiguredDataDirEnv() {
  return (
    process.env[ENV_KEYS.dataDir]
    || process.env[LEGACY_ENV_KEYS.dataDir]
    || process.env[LEGACY_ENV_KEYS.legacyDataDir]
    || null
  );
}

/** Documented legacy env aliases still accepted at runtime. */
export const ACCEPTED_LEGACY_ENV_ALIASES = Object.freeze([
  { canonical: ENV_KEYS.dataDir, legacy: [LEGACY_ENV_KEYS.dataDir, LEGACY_ENV_KEYS.legacyDataDir] },
  { canonical: ENV_KEYS.instanceName, legacy: [LEGACY_ENV_KEYS.instanceName] },
]);
