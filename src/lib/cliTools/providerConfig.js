import {
  CLI_PROVIDER_SLUG,
  LEGACY_CLI_PROVIDER_SLUG,
  DEFAULT_LOCAL_API_KEY,
  pickProviderEntry,
} from "@/shared/constants/cliIdentity.js";

export {
  CLI_PROVIDER_SLUG,
  LEGACY_CLI_PROVIDER_SLUG,
  DEFAULT_LOCAL_API_KEY,
};

/** Whether a provider map contains HAI-Router (canonical or legacy slug). */
export function hasHairouterInMap(map) {
  if (!map || typeof map !== "object") return false;
  return Boolean(map[CLI_PROVIDER_SLUG] || map[LEGACY_CLI_PROVIDER_SLUG]);
}

/** Pick provider entry; prefers canonical slug. */
export function getProviderFromMap(map) {
  const { key, value, legacy } = pickProviderEntry(map || {});
  return { slug: key, config: value, legacy };
}

export function hairouterModelId(modelName) {
  return `${CLI_PROVIDER_SLUG}/${modelName}`;
}

export function isHairouterPrefixedModel(model) {
  const s = String(model || "");
  return s.startsWith(`${CLI_PROVIDER_SLUG}/`) || s.startsWith(`${LEGACY_CLI_PROVIDER_SLUG}/`);
}

export function stripHairouterModelPrefix(model) {
  const s = String(model || "");
  if (s.startsWith(`${CLI_PROVIDER_SLUG}/`)) return s.slice(CLI_PROVIDER_SLUG.length + 1);
  if (s.startsWith(`${LEGACY_CLI_PROVIDER_SLUG}/`)) return s.slice(LEGACY_CLI_PROVIDER_SLUG.length + 1);
  return null;
}

export function resolveCliApiKey(apiKey) {
  const trimmed = String(apiKey || "").trim();
  return trimmed || DEFAULT_LOCAL_API_KEY;
}

/** Write canonical provider slug; remove legacy slug when migrating. */
export function setCanonicalProvider(map, config) {
  if (!map || typeof map !== "object") return config;
  if (map[LEGACY_CLI_PROVIDER_SLUG] && !map[CLI_PROVIDER_SLUG]) {
    delete map[LEGACY_CLI_PROVIDER_SLUG];
  }
  map[CLI_PROVIDER_SLUG] = config;
  return config;
}

/** Remove HAI-Router provider (canonical + legacy) from a map. */
export function removeHairouterProvider(map) {
  if (!map || typeof map !== "object") return;
  delete map[CLI_PROVIDER_SLUG];
  delete map[LEGACY_CLI_PROVIDER_SLUG];
}
