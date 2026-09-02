import { BACKUP_SCHEMA_VERSION, PRODUCT_ID, getAppVersion, normalizeBackupProduct } from "@/shared/constants/product.js";

export function wrapBackupExport(data) {
  return {
    product: PRODUCT_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: getAppVersion(),
    exportedAt: new Date().toISOString(),
    ...data,
  };
}

export function unwrapBackupImport(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid backup payload");
  }
  const { legacy, product } = normalizeBackupProduct(payload);
  if (legacy && (payload.settings || payload.providerConnections)) {
    return {
      data: payload,
      meta: { product: product || "9router", legacy: true },
    };
  }
  const {
    product: wrappedProduct,
    schemaVersion,
    appVersion,
    exportedAt,
    ...data
  } = payload;
  return {
    data,
    meta: {
      product: wrappedProduct || product,
      schemaVersion,
      appVersion,
      exportedAt,
      legacy,
    },
  };
}
