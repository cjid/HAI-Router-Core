import {
  DEFAULT_CAPABILITIES,
  MODEL_CAPABILITIES,
  PROVIDER_CAPABILITIES,
  PATTERN_CAPABILITIES,
} from "open-sse/providers/capabilities.js";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";
import { MODEL_PRICING, PROVIDER_PRICING, matchPattern } from "open-sse/providers/pricing.js";

/** Resellers/routers — never apply global MODEL/PATTERN pricing heuristics in the catalog UI. */
const RESELLER_PROVIDER_IDS = new Set([
  "openrouter",
  "kilocode",
  "tokenrouter",
]);

export const INPUT_MODALITY_META = {
  text: { icon: "text_fields", label: "Text" },
  image: { icon: "image", label: "Image" },
  audio: { icon: "mic", label: "Audio" },
  video: { icon: "videocam", label: "Video" },
  file: { icon: "description", label: "File / Documents" },
};

export const OUTPUT_MODALITY_META = {
  text: { icon: "text_fields", label: "Text" },
  image: { icon: "image", label: "Image" },
  audio: { icon: "volume_up", label: "Audio" },
  video: { icon: "videocam", label: "Video" },
};

/** Human-readable context: 128000 → 128K, 1000000 → 1M */
export function formatContextTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

export function formatPricePerMillion(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return "$0.00";
  return `$${n.toFixed(2)}`;
}

/** Presentation-only pricing status — never infer zero cost from null metadata. */
export function resolvePricingStatus(inputPrice, outputPrice, { isFree = false, providerQuota = false } = {}) {
  if (providerQuota) return "provider_quota";
  if (isFree || (Number.isFinite(inputPrice) && Number.isFinite(outputPrice) && inputPrice === 0 && outputPrice === 0)) {
    return "free";
  }
  if (Number.isFinite(inputPrice) || Number.isFinite(outputPrice)) return "priced";
  return "unknown";
}

/** Convert provider API price fields to USD / 1M tokens. */
function normalizeCatalogPrice(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return 0;
  // OpenRouter-style per-token USD (e.g. 1.4e-7)
  if (n > 0 && n < 0.01) return n * 1_000_000;
  return n;
}

function extractPricingFromProviderRaw(raw = {}) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.isFree === true) return { input: 0, output: 0 };

  const nested = raw.pricing;
  if (nested && typeof nested === "object") {
    const input = normalizeCatalogPrice(nested.prompt ?? nested.input);
    const output = normalizeCatalogPrice(nested.completion ?? nested.output);
    if (Number.isFinite(input) || Number.isFinite(output)) {
      return {
        input: Number.isFinite(input) ? input : null,
        output: Number.isFinite(output) ? output : null,
      };
    }
  }

  const input = normalizeCatalogPrice(
    raw.inputPrice ?? raw.input_price ?? raw.input_price_per_million,
  );
  const output = normalizeCatalogPrice(
    raw.outputPrice ?? raw.output_price ?? raw.output_price_per_million,
  );
  if (Number.isFinite(input) || Number.isFinite(output)) {
    return {
      input: Number.isFinite(input) ? input : null,
      output: Number.isFinite(output) ? output : null,
    };
  }

  return null;
}

/**
 * Catalog pricing — provider-authoritative only. No global pattern guessing.
 * Order: provider API payload → PROVIDER_PRICING exact → MODEL_PRICING exact (direct vendors only).
 */
export function resolveCatalogPricing(providerId, modelId, raw = {}) {
  const fromProvider = extractPricingFromProviderRaw(raw);
  if (fromProvider) return fromProvider;

  const providerExact = PROVIDER_PRICING[providerId]?.[modelId];
  if (providerExact) {
    return { input: providerExact.input ?? null, output: providerExact.output ?? null };
  }

  if (!RESELLER_PROVIDER_IDS.has(providerId)) {
    const baseModel = modelId.includes("/") ? modelId.split("/").pop() : modelId;
    const canonical = MODEL_PRICING[modelId] ?? MODEL_PRICING[baseModel];
    if (canonical) {
      return { input: canonical.input ?? null, output: canonical.output ?? null };
    }
  }

  return null;
}

function buildProviderSnapshot(raw = {}) {
  if (!raw || typeof raw !== "object") return undefined;
  const snap = {};
  if (raw.pricing != null) snap.pricing = raw.pricing;
  if (raw.isFree === true) snap.isFree = true;
  if (raw.context_length != null) snap.context_length = raw.context_length;
  if (raw.contextLength != null) snap.contextLength = raw.contextLength;
  return Object.keys(snap).length ? snap : undefined;
}

/** Re-apply provider-authoritative pricing to a persisted catalog row. */
export function refreshCatalogRowPricing(row, providerId) {
  if (!row?.modelId) return row;
  const raw = row.providerSnapshot || {};
  const resolved = resolveCatalogPricing(providerId, row.modelId, raw);
  const inputPrice = resolved?.input ?? null;
  const outputPrice = resolved?.output ?? null;
  const isFree = raw.isFree === true || (inputPrice === 0 && outputPrice === 0);
  const pricingStatus = resolvePricingStatus(inputPrice, outputPrice, { isFree });
  const pricingDisplay = formatModelPricing({ inputPrice, outputPrice, pricingStatus, isFree });
  const pricingTier = resolvePricingTier({ inputPrice, outputPrice, pricingStatus, isFree });
  return {
    ...row,
    inputPrice: Number.isFinite(inputPrice) ? inputPrice : null,
    outputPrice: Number.isFinite(outputPrice) ? outputPrice : null,
    pricingStatus,
    pricingDisplay,
    pricingTier,
    inputPriceLabel: pricingDisplay.inputLabel,
    outputPriceLabel: pricingDisplay.outputLabel,
    isFree: pricingStatus === "free",
  };
}

export const PRICING_TIER_THRESHOLDS = Object.freeze({
  cheapMax: 2,
  mediumMax: 5,
});

const PILL = "inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium";

export const PRICING_TIER_STYLES = Object.freeze({
  free: {
    label: "Free",
    className: `${PILL} border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400`,
  },
  cheap: {
    label: "Cheap",
    className: `${PILL} border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400`,
  },
  medium: {
    label: "Medium",
    className: `${PILL} border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400`,
  },
  expensive: {
    label: "Expensive",
    className: `${PILL} border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400`,
  },
});

/** Band paid models from input USD / 1M. Returns null when a badge would be misleading. */
export function resolvePricingTier({
  inputPrice = null,
  outputPrice = null,
  pricingStatus,
  isFree = false,
  providerQuota = false,
} = {}) {
  const status = pricingStatus || resolvePricingStatus(inputPrice, outputPrice, { isFree, providerQuota });
  if (status === "free") return { tier: "free", ...PRICING_TIER_STYLES.free };
  if (status !== "priced" || !Number.isFinite(inputPrice)) return null;
  if (inputPrice < PRICING_TIER_THRESHOLDS.cheapMax) {
    return { tier: "cheap", ...PRICING_TIER_STYLES.cheap };
  }
  if (inputPrice < PRICING_TIER_THRESHOLDS.mediumMax) {
    return { tier: "medium", ...PRICING_TIER_STYLES.medium };
  }
  return { tier: "expensive", ...PRICING_TIER_STYLES.expensive };
}

export function formatModelPricing({
  inputPrice = null,
  outputPrice = null,
  pricingStatus,
  isFree = false,
  providerQuota = false,
} = {}) {
  const status = pricingStatus || resolvePricingStatus(inputPrice, outputPrice, { isFree, providerQuota });
  if (status === "free") {
    return { status, label: "Free", inputLabel: "Free", outputLabel: "Free", compact: "Free" };
  }
  if (status === "provider_quota") {
    return { status, label: "Included", inputLabel: "Included", outputLabel: "Included", compact: "Included" };
  }
  if (status === "unknown") {
    return { status, label: "—", inputLabel: "—", outputLabel: "—", compact: "—" };
  }
  const inputLabel = Number.isFinite(inputPrice) ? formatPricePerMillion(inputPrice) : "—";
  const outputLabel = Number.isFinite(outputPrice) ? formatPricePerMillion(outputPrice) : "—";
  return {
    status: "priced",
    label: `${inputLabel} / ${outputLabel}`,
    inputLabel,
    outputLabel,
    compact: `${inputLabel} / ${outputLabel}`,
  };
}

function hasExplicitCapabilityEntry(provider, model) {
  if (!model) return false;
  const baseModel = model.includes("/") ? model.split("/").pop() : model;
  if (provider) {
    const pc = PROVIDER_CAPABILITIES[provider];
    if (pc?.[model] || pc?.[baseModel]) return true;
  }
  if (MODEL_CAPABILITIES[baseModel] || MODEL_CAPABILITIES[model]) return true;
  for (const { pattern } of PATTERN_CAPABILITIES) {
    if (matchPattern(pattern, baseModel) || matchPattern(pattern, model)) return true;
  }
  return false;
}

function modalitiesFromProviderResponse(raw) {
  const input = raw?.modalities?.input || raw?.input_modalities;
  const output = raw?.modalities?.output || raw?.output_modalities;
  return {
    input: Array.isArray(input) ? input.map(String) : null,
    output: Array.isArray(output) ? output.map(String) : null,
  };
}

function deriveInputModalities(caps, raw) {
  const fromApi = modalitiesFromProviderResponse(raw).input;
  if (fromApi?.length) {
    return fromApi.map((m) => {
      const key = m.toLowerCase();
      if (key.includes("image")) return "image";
      if (key.includes("audio")) return "audio";
      if (key.includes("video")) return "video";
      if (key.includes("pdf") || key.includes("file")) return "file";
      return "text";
    });
  }
  const out = ["text"];
  if (caps.vision) out.push("image");
  if (caps.pdf) out.push("file");
  if (caps.audioInput) out.push("audio");
  if (caps.videoInput) out.push("video");
  return [...new Set(out)];
}

function deriveOutputModalities(caps, raw) {
  const fromApi = modalitiesFromProviderResponse(raw).output;
  if (fromApi?.length) {
    return fromApi.map((m) => {
      const key = m.toLowerCase();
      if (key.includes("image")) return "image";
      if (key.includes("audio")) return "audio";
      if (key.includes("video")) return "video";
      return "text";
    });
  }
  const out = ["text"];
  if (caps.imageOutput) out.push("image");
  if (caps.audioOutput) out.push("audio");
  return [...new Set(out)];
}

function deriveReasoning(caps, raw, hasExplicit) {
  if (raw?.reasoning === true || raw?.isReasoning === true) return "yes";
  if (raw?.reasoning === false || raw?.isReasoning === false) return "no";
  if (!hasExplicit) return "unknown";
  return caps.reasoning ? "yes" : "no";
}

function resolveContextTokens(caps, raw, hasExplicit) {
  const fromApi = Number(raw?.context_length ?? raw?.contextLength ?? raw?.context_window);
  if (Number.isFinite(fromApi) && fromApi > 0) return fromApi;
  if (!hasExplicit && caps.contextWindow === DEFAULT_CAPABILITIES.contextWindow) return null;
  return caps.contextWindow > 0 ? caps.contextWindow : null;
}

/**
 * Enrich a canonical model row for the catalog table.
 * Never infers pricing/capability from model name alone.
 */
export function enrichModelRecord({
  providerId,
  modelId,
  displayName,
  source = "registry",
  available = true,
  raw = {},
}) {
  const caps = getCapabilitiesForModel(providerId, modelId);
  const hasExplicit = hasExplicitCapabilityEntry(providerId, modelId);
  const resolved = resolveCatalogPricing(providerId, modelId, raw);
  const inputPrice = resolved?.input ?? null;
  const outputPrice = resolved?.output ?? null;
  const isFree = raw.isFree === true || (inputPrice === 0 && outputPrice === 0);
  const pricingStatus = resolvePricingStatus(inputPrice, outputPrice, { isFree });
  const pricingDisplay = formatModelPricing({ inputPrice, outputPrice, pricingStatus, isFree });
  const pricingTier = resolvePricingTier({ inputPrice, outputPrice, pricingStatus, isFree });
  const contextTokens = resolveContextTokens(caps, raw, hasExplicit);

  let metadataComplete = Boolean(pricingStatus === "priced" && contextTokens != null);
  if (!hasExplicit) metadataComplete = false;

  return {
    modelId,
    displayName: displayName || raw.name || raw.displayName || modelId,
    source,
    available,
    inputModalities: deriveInputModalities(caps, raw),
    outputModalities: deriveOutputModalities(caps, raw),
    reasoning: deriveReasoning(caps, raw, hasExplicit),
    contextTokens,
    contextLabel: formatContextTokens(contextTokens) || "—",
    inputPrice: Number.isFinite(inputPrice) ? inputPrice : null,
    outputPrice: Number.isFinite(outputPrice) ? outputPrice : null,
    pricingStatus,
    pricingDisplay,
    pricingTier,
    inputPriceLabel: pricingDisplay.inputLabel,
    outputPriceLabel: pricingDisplay.outputLabel,
    metadataComplete,
    isFree: pricingStatus === "free",
    providerSnapshot: buildProviderSnapshot(raw),
  };
}

export function enrichModelList(models, providerId, { source = "registry" } = {}) {
  let complete = 0;
  let partial = 0;
  let unknown = 0;
  const rows = (models || []).map((m) => {
    const modelId = m.id || m.model || m.name;
    if (!modelId) return null;
    const row = enrichModelRecord({
      providerId,
      modelId,
      displayName: m.name || m.displayName,
      source: m.source || source,
      available: m.available !== false,
      raw: m,
    });
    if (row.metadataComplete) complete += 1;
    else if (row.reasoning === "unknown" && row.contextLabel === "—" && row.inputPriceLabel === "—") unknown += 1;
    else partial += 1;
    return row;
  }).filter(Boolean);
  return { rows, stats: { total: rows.length, complete, partial, unknown } };
}
