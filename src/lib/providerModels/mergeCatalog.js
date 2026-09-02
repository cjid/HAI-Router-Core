/**
 * Merge provider discovery results into persisted catalog rows.
 * Manual/custom models are never removed; stale provider rows are marked unavailable.
 */
export function mergeDiscoveredCatalog(existingModels = [], freshModels = []) {
  const now = new Date().toISOString();
  const byId = new Map();

  for (const row of existingModels) {
    if (!row?.modelId) continue;
    byId.set(row.modelId, { ...row });
  }

  const freshIds = new Set();
  for (const row of freshModels) {
    if (!row?.modelId) continue;
    freshIds.add(row.modelId);
    const prev = byId.get(row.modelId);
    byId.set(row.modelId, {
      ...prev,
      ...row,
      source: prev?.source === "custom" ? "custom" : "provider",
      available: true,
      stale: false,
      lastSeenAt: now,
      updatedAt: now,
    });
  }

  for (const [id, row] of byId.entries()) {
    if (row.source === "custom" || row.source === "manual") continue;
    if (!freshIds.has(id) && row.source === "provider") {
      byId.set(id, {
        ...row,
        stale: true,
        available: false,
        syncStatus: "unavailable",
        lastSeenAt: row.lastSeenAt || row.updatedAt,
        updatedAt: now,
      });
    }
  }

  return [...byId.values()];
}
