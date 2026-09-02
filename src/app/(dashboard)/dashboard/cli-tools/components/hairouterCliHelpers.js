import {
  CLI_PROVIDER_SLUG,
  LEGACY_CLI_PROVIDER_SLUG,
  getProviderFromMap,
  hairouterModelId,
  isHairouterPrefixedModel,
  stripHairouterModelPrefix,
} from "@/lib/cliTools/providerConfig.js";
import { DEFAULT_LOCAL_API_KEY } from "@/shared/constants/cliIdentity.js";

export {
  CLI_PROVIDER_SLUG,
  LEGACY_CLI_PROVIDER_SLUG,
  DEFAULT_LOCAL_API_KEY,
  hairouterModelId,
  isHairouterPrefixedModel,
  stripHairouterModelPrefix,
};

/** Pick HAI-Router provider config block from a CLI tool provider map. */
export function pickProviderBlock(map) {
  const { config } = getProviderFromMap(map);
  return config ?? null;
}

/** API status flag with legacy fallback during transition. */
export function isHairouterConfigured(status) {
  return Boolean(status?.hasHairouter ?? status?.has9Router);
}

/** Droid Factory custom model id prefixes. */
export const HAIROUTER_DROID_PREFIX = "custom:HAI-Router";
export const LEGACY_DROID_PREFIX = "custom:9Router";

export function isDroidHairouterModel(model) {
  const id = model?.id || "";
  return id.startsWith(HAIROUTER_DROID_PREFIX) || id.startsWith(LEGACY_DROID_PREFIX);
}
