/** Canonical HAI-Router product identity — single source of truth. */
export const PRODUCT = Object.freeze({
  id: "hairouter",
  name: "HAI-Router",
  displayName: "HAI-Router",
  slug: "hairouter",
  dataDirName: "hairouter",
  legacyDataDirName: "9router",
  envPrefix: "HAI_ROUTER_",
  storagePrefix: "hairouter",
  userAgent: "HAI-Router",
  samlIssuerDefault: "urn:hairouter:sp",
  backupProductId: "hairouter",
  version: "0.1.0-init",
});

export const PRODUCT_ID = PRODUCT.id;
export const PRODUCT_DISPLAY_NAME = PRODUCT.displayName;

/** Historical upstream attribution (Footer only). */
export const LEGACY_ATTRIBUTION = Object.freeze({
  name: "9Router",
  version: "0.5.59",
  repoUrl: "https://github.com/decolua/9router",
});

/** Legacy product identifiers — import / migration readers only. */
export const LEGACY_PRODUCT_IDS = Object.freeze(["9router", "9Router", "9router-app"]);

/** Legacy SAML issuer accepted on read. */
export const LEGACY_SAML_ISSUER = "urn:9router:sp";

/** Canonical + legacy HTTP headers (product-owned). */
export const PRODUCT_HEADERS = Object.freeze({
  connectionId: "x-hai-router-connection-id",
  legacyConnectionId: "x-9router-connection-id",
});

/** Client persistence keys (canonical). */
export const STORAGE_KEYS = Object.freeze({
  theme: `${PRODUCT.storagePrefix}.theme`,
});

/** Legacy localStorage keys migrated once to canonical. */
export const LEGACY_STORAGE_KEYS = Object.freeze({
  theme: Object.freeze(["theme", "9router-theme", "9router.theme"]),
});

export const BACKUP_SCHEMA_VERSION = 1;

export function getAppVersion() {
  // HAI-Router release version — not upstream 9Router base (see LEGACY_ATTRIBUTION.version).
  return PRODUCT.version;
}

export function isLegacyProductId(value) {
  if (!value) return false;
  return LEGACY_PRODUCT_IDS.includes(String(value));
}

export function normalizeBackupProduct(payload) {
  if (!payload || typeof payload !== "object") return { product: null, legacy: false };
  const product = payload.product || payload.productId || payload.app || null;
  if (product === PRODUCT_ID) return { product: PRODUCT_ID, legacy: false };
  if (isLegacyProductId(product)) return { product, legacy: true };
  if (!product && (payload.settings || payload.providerConnections)) {
    return { product: LEGACY_PRODUCT_IDS[0], legacy: true };
  }
  return { product, legacy: isLegacyProductId(product) };
}

export function resolveSamlIssuer(value) {
  const trimmed = String(value || "").trim();
  if (trimmed) return trimmed;
  return PRODUCT.samlIssuerDefault;
}
