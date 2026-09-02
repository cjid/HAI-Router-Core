import { getModelsByProviderId } from "@/shared/constants/models";
import { AI_PROVIDERS, resolveProviderId } from "@/shared/constants/providers";
import { enrichModelRecord } from "@/shared/utils/modelCatalog";

export function splitModelValue(modelValue) {
  if (!modelValue || typeof modelValue !== "string") return null;
  const slash = modelValue.indexOf("/");
  if (slash <= 0) {
    return { alias: null, modelId: modelValue, isCombo: true };
  }
  return {
    alias: modelValue.slice(0, slash),
    modelId: modelValue.slice(slash + 1),
    isCombo: false,
  };
}

function resolveDisplayName(modelValue, alias, modelId, providerId, modelAliases = {}) {
  for (const [aliasKey, fullModel] of Object.entries(modelAliases)) {
    if (fullModel === modelValue) return aliasKey;
  }

  const registryModel = getModelsByProviderId(providerId).find((m) => m.id === modelId);
  if (registryModel?.name) return registryModel.name;

  for (const [aliasKey, fullModel] of Object.entries(modelAliases)) {
    if (fullModel.endsWith(`/${modelId}`)) {
      const keyAlias = fullModel.slice(0, fullModel.indexOf("/"));
      if (keyAlias === alias || keyAlias === providerId) return aliasKey;
    }
  }

  return modelId;
}

/**
 * Canonical model metadata for combo/picker UI — same enrichModelRecord path as Providers > Models.
 */
export function resolveModelPickerMeta(modelValue, { modelAliases = {}, raw = {} } = {}) {
  const parts = splitModelValue(modelValue);
  if (!parts) return null;

  if (parts.isCombo) {
    return {
      modelValue,
      displayName: modelValue,
      isCombo: true,
      inputModalities: [],
      outputModalities: ["text"],
      reasoning: "unknown",
      contextLabel: "—",
    };
  }

  const { alias, modelId } = parts;
  const providerId = resolveProviderId(alias);
  const providerInfo = AI_PROVIDERS[providerId] || {};
  const displayName = resolveDisplayName(modelValue, alias, modelId, providerId, modelAliases);

  const enriched = enrichModelRecord({
    providerId,
    modelId,
    displayName,
    source: "registry",
    raw,
  });

  return {
    ...enriched,
    modelValue,
    providerAlias: alias,
    providerId,
    providerName: providerInfo.name || providerId,
    isCombo: false,
  };
}

export function attachPickerMeta(model, providerId, { modelAliases = {}, raw = {} } = {}) {
  if (model.meta) return model;
  if (model.isPlaceholder) return model;
  const value = model.value || `${model.alias || ""}/${model.id}`;
  const meta = resolveModelPickerMeta(value, {
    modelAliases,
    raw: model.catalogRow?.providerSnapshot || model.catalogRow || raw,
  });
  return { ...model, meta };
}
