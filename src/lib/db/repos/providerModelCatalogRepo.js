import { getAdapter } from "../driver.js";
import { stringifyJson, parseJson } from "../helpers/jsonCol.js";
import { buildCatalogKey, resolveEndpointIdentity } from "@/lib/providerModels/catalogKey.js";

const now = () => new Date().toISOString();

export function getCatalogMeta(connection) {
  const catalogKey = buildCatalogKey({
    providerId: connection.provider,
    connectionId: connection.id,
    endpointIdentity: resolveEndpointIdentity(connection),
  });
  return { catalogKey, endpointIdentity: resolveEndpointIdentity(connection) };
}

export async function loadProviderModelCatalog(connection) {
  const db = await getAdapter();
  const { catalogKey } = getCatalogMeta(connection);
  const row = db.get(
    `SELECT * FROM providerModelCatalog WHERE catalogKey = ?`,
    [catalogKey],
  );
  if (!row) return null;
  return {
    catalogKey: row.catalogKey,
    providerId: row.providerId,
    connectionId: row.connectionId,
    endpointIdentity: row.endpointIdentity,
    syncStatus: row.syncStatus,
    lastSyncAt: row.lastSyncAt,
    lastError: row.lastError,
    requestId: row.requestId,
    modelCount: row.modelCount,
    enrichment: parseJson(row.enrichmentStats, null),
    models: parseJson(row.models, []),
    updatedAt: row.updatedAt,
  };
}

export async function persistProviderModelCatalog(connection, {
  models = [],
  enrichment = null,
  syncStatus = "synced",
  lastError = null,
  requestId = null,
}) {
  const db = await getAdapter();
  const { catalogKey, endpointIdentity } = getCatalogMeta(connection);
  const ts = now();

  db.run(
    `INSERT INTO providerModelCatalog(
      catalogKey, providerId, connectionId, endpointIdentity,
      syncStatus, lastSyncAt, lastError, requestId, modelCount,
      enrichmentStats, models, createdAt, updatedAt
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(catalogKey) DO UPDATE SET
      syncStatus = excluded.syncStatus,
      lastSyncAt = excluded.lastSyncAt,
      lastError = excluded.lastError,
      requestId = excluded.requestId,
      modelCount = excluded.modelCount,
      enrichmentStats = excluded.enrichmentStats,
      models = excluded.models,
      updatedAt = excluded.updatedAt`,
    [
      catalogKey,
      connection.provider,
      connection.id,
      endpointIdentity,
      syncStatus,
      syncStatus === "synced" ? ts : null,
      lastError,
      requestId,
      models.length,
      stringifyJson(enrichment),
      stringifyJson(models),
      ts,
      ts,
    ],
  );

  return { catalogKey, lastSyncAt: syncStatus === "synced" ? ts : null, modelCount: models.length };
}

export async function markCatalogSyncFailed(connection, { error, requestId }) {
  const existing = await loadProviderModelCatalog(connection);
  return persistProviderModelCatalog(connection, {
    models: existing?.models || [],
    enrichment: existing?.enrichment || null,
    syncStatus: "failed",
    lastError: String(error || "sync failed"),
    requestId,
  });
}

export async function listAllProviderModelCatalogs() {
  const db = await getAdapter();
  return db.all(`SELECT catalogKey, providerId, connectionId, syncStatus, lastSyncAt, modelCount, updatedAt FROM providerModelCatalog`);
}

export async function deleteCatalogForConnection(connection) {
  const db = await getAdapter();
  const { catalogKey } = getCatalogMeta(connection);
  db.run(`DELETE FROM providerModelCatalog WHERE catalogKey = ?`, [catalogKey]);
}
