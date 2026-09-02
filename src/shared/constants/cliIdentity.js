import { PRODUCT_DISPLAY_NAME } from "@/shared/constants/product.js";

/** Canonical CLI provider slug written into external tool configs. */
export const CLI_PROVIDER_SLUG = "hairouter";

/** Legacy CLI provider slug — read-only compatibility. */
export const LEGACY_CLI_PROVIDER_SLUG = "9router";

export const DEFAULT_LOCAL_API_KEY = "sk_hairouter";

/** Legacy default local API key — accepted on read. */
export const LEGACY_LOCAL_API_KEY = "sk_9router";

export const CLI_GATEWAY_DISPLAY_NAME = PRODUCT_DISPLAY_NAME;

export function pickProviderEntry(map) {
  if (!map || typeof map !== "object") {
    return { key: CLI_PROVIDER_SLUG, value: null, legacy: false };
  }
  if (map[CLI_PROVIDER_SLUG]) {
    return { key: CLI_PROVIDER_SLUG, value: map[CLI_PROVIDER_SLUG], legacy: false };
  }
  if (map[LEGACY_CLI_PROVIDER_SLUG]) {
    return { key: LEGACY_CLI_PROVIDER_SLUG, value: map[LEGACY_CLI_PROVIDER_SLUG], legacy: true };
  }
  return { key: CLI_PROVIDER_SLUG, value: null, legacy: false };
}

export function gatewayConfigured(status) {
  return Boolean(status?.hasHairouter ?? status?.has9Router);
}

export function resolveLocalApiKey({ cloudEnabled, selectedApiKey, apiKeys } = {}) {
  if (selectedApiKey?.trim()) return selectedApiKey.trim();
  if (apiKeys?.length > 0) return apiKeys[0].key;
  if (!cloudEnabled) return DEFAULT_LOCAL_API_KEY;
  return null;
}

export function acceptsLocalApiKey(key) {
  const k = String(key || "").trim();
  return k === DEFAULT_LOCAL_API_KEY || k === LEGACY_LOCAL_API_KEY;
}
