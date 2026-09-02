import { getModelKind } from "@/shared/constants/models";

/**
 * Enrich configured picker models with persisted catalog metadata.
 * Does NOT add catalog-only / repo models — same SSOT as Providers > Models Configuration.
 */
export function enrichPickerModelsFromCatalog(models, catalogRows = [], disabledIds = new Set()) {
  const catalogByModelId = new Map(
    (catalogRows || []).filter((r) => r?.modelId).map((r) => [r.modelId, r]),
  );

  return (models || [])
    .filter((m) => m.isPlaceholder || !disabledIds.has(m.id))
    .map((m) => {
      const row = catalogByModelId.get(m.id);
      if (!row) return m;
      return {
        ...m,
        name: row.displayName || m.name,
        kind: m.kind || getModelKind(row),
        catalogRow: row,
        meta: row,
        fromCatalog: true,
      };
    });
}

/**
 * Filter picker models to enabled configuration, keeping already-added combo members visible.
 */
export function filterEnabledPickerModels(models, disabledIds, { keepValues = [] } = {}) {
  const keep = new Set(keepValues || []);
  return (models || []).filter(
    (m) => m.isPlaceholder || !disabledIds.has(m.id) || keep.has(m.value),
  );
}
