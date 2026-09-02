import {
  isAnthropicCompatibleProvider,
  isOpenAICompatibleProvider,
} from "@/shared/constants/providers";

/** @typedef {"openai" | "anthropic"} CustomProviderCompatibility */

const FAVICON_PATHS = ["/favicon.ico", "/favicon.png", "/apple-touch-icon.png"];

/** Conservative compound public suffixes — avoid stripping to bare ccTLD. */
const COMPOUND_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au",
  "co.jp", "ne.jp", "or.jp",
  "com.br", "com.mx", "com.ar", "com.tr",
  "co.nz", "co.kr", "co.za", "com.sg", "com.hk", "com.tw", "com.cn",
]);

/** @type {Map<string, { status: "resolved", url: string } | { status: "fallback" }>} */
const resolutionCache = new Map();
const cacheListeners = new Set();
let cacheVersion = 0;

function notifyCacheListeners() {
  cacheVersion += 1;
  for (const fn of cacheListeners) {
    fn();
  }
}

export function subscribeCustomProviderIconCache(listener) {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

export function getCustomProviderIconCacheVersion() {
  return cacheVersion;
}

/**
 * Normalize completion API URL to origin (protocol + host + port).
 * @param {string} baseUrl
 * @returns {string | null}
 */
export function normalizeCompletionOrigin(baseUrl) {
  if (!baseUrl || typeof baseUrl !== "string") return null;
  const trimmed = baseUrl.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const host = parsed.hostname;
    const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":");
    const isLocal = host === "localhost";
    if (!isIp && !isLocal && !host.includes(".")) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/** @param {string} hostname */
export function isPrivateOrLocalHost(hostname) {
  if (!hostname || typeof hostname !== "string") return true;
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) {
    return true;
  }

  return false;
}

/**
 * Registrable domain for safe root-origin fallback (conservative).
 * @param {string} hostname
 * @returns {string | null}
 */
export function getRegistrableDomain(hostname) {
  if (!hostname || isPrivateOrLocalHost(hostname)) return null;
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length < 2) return null;

  const lastTwo = parts.slice(-2).join(".");
  const registrableLabelCount = COMPOUND_SUFFIXES.has(lastTwo) ? 3 : 2;
  if (parts.length <= registrableLabelCount) return null;

  return parts.slice(-registrableLabelCount).join(".");
}

/**
 * Stable cache key from completion URL origin.
 * @param {string} baseUrl
 * @returns {string | null}
 */
export function getCustomProviderIconCacheKey(baseUrl) {
  return normalizeCompletionOrigin(baseUrl);
}

/** @param {string} origin */
function buildOriginFaviconCandidates(origin) {
  return FAVICON_PATHS.map((path) => `${origin}${path}`);
}

/**
 * Deterministic favicon candidate URLs from completion base URL.
 * @param {string} baseUrl
 * @returns {string[]}
 */
export function buildCustomProviderIconCandidates(baseUrl) {
  const origin = normalizeCompletionOrigin(baseUrl);
  if (!origin) return [];

  const candidates = [...buildOriginFaviconCandidates(origin)];

  try {
    const { protocol, hostname } = new URL(origin);
    const root = getRegistrableDomain(hostname);
    if (root && root !== hostname) {
      const rootOrigin = `${protocol}//${root}`;
      if (rootOrigin !== origin) {
        candidates.push(...buildOriginFaviconCandidates(rootOrigin));
      }
    }
  } catch {
    // origin already validated
  }

  return candidates;
}

/**
 * @param {CustomProviderCompatibility} compatibility
 * @param {"chat" | "responses" | undefined} apiType
 */
export function getCompatibilityFallbackIconSrc(compatibility, apiType) {
  if (compatibility === "anthropic") return "/providers/anthropic-m.png";
  if (apiType === "responses") return "/providers/oai-r.png";
  return "/providers/oai-cc.png";
}

/**
 * @param {string} providerId
 * @returns {CustomProviderCompatibility | null}
 */
export function resolveCustomProviderCompatibility(providerId) {
  if (isAnthropicCompatibleProvider(providerId)) return "anthropic";
  if (isOpenAICompatibleProvider(providerId)) return "openai";
  return null;
}

/**
 * @param {string} cacheKey
 * @returns {{ status: "resolved", url: string } | { status: "fallback" } | null}
 */
export function getCachedCustomProviderIcon(cacheKey) {
  if (!cacheKey) return null;
  return resolutionCache.get(cacheKey) || null;
}

/**
 * @param {string} cacheKey
 * @param {string} url
 */
export function cacheResolvedCustomProviderIcon(cacheKey, url) {
  if (!cacheKey || !url) return;
  const existing = resolutionCache.get(cacheKey);
  if (existing?.status === "resolved" && existing.url === url) return;
  resolutionCache.set(cacheKey, { status: "resolved", url });
  notifyCacheListeners();
}

/** @param {string} cacheKey */
export function cacheFallbackCustomProviderIcon(cacheKey) {
  if (!cacheKey) return;
  if (resolutionCache.get(cacheKey)?.status === "fallback") return;
  resolutionCache.set(cacheKey, { status: "fallback" });
  notifyCacheListeners();
}

/** Test-only */
export function clearCustomProviderIconCache() {
  resolutionCache.clear();
  notifyCacheListeners();
}
