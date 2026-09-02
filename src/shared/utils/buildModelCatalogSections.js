import { enrichModelRecord } from "@/shared/utils/modelCatalog";

function mergeStaticRow(byId, {
  providerId,
  providerDisplayAlias,
  providerStorageAlias,
  modelId,
  displayName,
  source,
  raw,
  isCustom,
}) {
  const enriched = enrichModelRecord({
    providerId,
    modelId,
    displayName,
    source,
    raw,
  });
  byId.set(modelId, {
    ...enriched,
    fullModel: `${providerDisplayAlias}/${modelId}`,
    storageModel: `${providerStorageAlias}/${modelId}`,
    isCustom: Boolean(isCustom),
    stale: false,
  });
}

function enrichDiscoveredRow({
  providerId,
  providerDisplayAlias,
  providerStorageAlias,
  row,
}) {
  const id = row.modelId;
  const enriched = enrichModelRecord({
    providerId,
    modelId: id,
    displayName: row.displayName,
    source: row.source || "provider",
    raw: row.providerSnapshot || row,
  });
  return {
    ...row,
    ...enriched,
    fullModel: `${providerDisplayAlias}/${id}`,
    storageModel: `${providerStorageAlias}/${id}`,
    isCustom: false,
    stale: row.stale ?? false,
    catalogSection: "repo-fetched",
  };
}

/**
 * configuredRows — models explicitly persisted in the user's routing configuration.
 * repoRows — canonical provider/default/fetched catalog entries not configured by the user.
 */
export function buildModelCatalogSections({
  providerId,
  providerStorageAlias,
  providerDisplayAlias,
  staticModels = [],
  customModelRows = [],
  discoveredRows = null,
  disabledModelIds = [],
  suggestedModels = [],
}) {
  const configuredById = new Map();
  const disabledSet = new Set(disabledModelIds);
  const staticById = new Map(staticModels.filter((m) => m?.id).map((m) => [m.id, m]));

  for (const row of customModelRows) {
    if (!row?.id) continue;
    mergeStaticRow(configuredById, {
      providerId,
      providerDisplayAlias,
      providerStorageAlias,
      modelId: row.id,
      displayName: staticById.get(row.id)?.name || row.name,
      source: "custom",
      raw: staticById.get(row.id) || row,
      isCustom: true,
    });
    const existing = configuredById.get(row.id);
    if (existing) {
      configuredById.set(row.id, {
        ...existing,
        storageModel: row.fullModel || existing.storageModel,
      });
    }
  }

  if (discoveredRows) {
    for (const row of discoveredRows) {
      const id = row.modelId;
      if (!id || !configuredById.has(id)) continue;
      const existing = configuredById.get(id);
      const pricingRow = enrichModelRecord({
        providerId,
        modelId: id,
        displayName: row.displayName || existing.displayName,
        source: existing.source,
        raw: row.providerSnapshot || row,
      });
      configuredById.set(id, {
        ...existing,
        displayName: row.displayName || existing.displayName,
        inputModalities: row.inputModalities ?? existing.inputModalities,
        outputModalities: row.outputModalities ?? existing.outputModalities,
        reasoning: row.reasoning ?? existing.reasoning,
        contextTokens: row.contextTokens ?? existing.contextTokens,
        contextLabel: row.contextLabel ?? existing.contextLabel,
        inputPrice: pricingRow.inputPrice,
        outputPrice: pricingRow.outputPrice,
        pricingStatus: pricingRow.pricingStatus,
        pricingDisplay: pricingRow.pricingDisplay,
        pricingTier: pricingRow.pricingTier,
        inputPriceLabel: pricingRow.inputPriceLabel,
        outputPriceLabel: pricingRow.outputPriceLabel,
        isFree: pricingRow.isFree,
        providerSnapshot: pricingRow.providerSnapshot ?? existing.providerSnapshot,
      });
    }
  }

  const configuredRows = [];

  for (const row of configuredById.values()) {
    configuredRows.push({
      ...row,
      catalogSection: disabledSet.has(row.modelId) ? "disabled" : "configured",
    });
  }

  configuredRows.sort((a, b) => a.modelId.localeCompare(b.modelId));

  const configuredIds = new Set(configuredById.keys());

  const repoById = new Map();

  if (discoveredRows) {
    for (const row of discoveredRows) {
      const id = row.modelId;
      if (!id || configuredIds.has(id)) continue;
      repoById.set(id, enrichDiscoveredRow({
        providerId,
        providerDisplayAlias,
        providerStorageAlias,
        row,
      }));
    }
  }

  for (const m of [...(suggestedModels || []), ...staticModels]) {
    if (!m?.id || configuredIds.has(m.id)) continue;
    const enriched = enrichModelRecord({
      providerId,
      modelId: m.id,
      displayName: m.name || m.displayName,
      source: "suggested",
      raw: m,
    });
    repoById.set(m.id, {
      ...enriched,
      fullModel: `${providerDisplayAlias}/${m.id}`,
      storageModel: `${providerStorageAlias}/${m.id}`,
      isCustom: false,
      stale: false,
      catalogSection: "repo-suggested",
    });
  }

  const repoRows = [...repoById.values()].sort((a, b) => a.modelId.localeCompare(b.modelId));

  return { configuredRows, repoRows };
}
