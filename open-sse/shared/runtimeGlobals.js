/**
 * Canonical in-process global stores (HAI-Router namespace).
 * Legacy __9router* keys are read once for migration, never written.
 */

const LEGACY_SUFFIXES = Object.freeze({
  usageStore: "__9routerUsageStore",
  refreshLocks: "__9routerRefreshLocks",
  rateLimitLanes: "__9routerRateLimitLanes",
  keyedLocks: "__9routerKeyedLocks",
  laneRegistry: "__9routerLaneRegistry",
  providerPacing: "__9routerProviderPacing",
  bgTokenRefresh: "__9routerBgTokenRefresh",
  mcpBridges: "__9routerMcpBridges",
  coworkMcpRegistryCache: "__9routerCoworkMcpRegistryCache",
});

const CANONICAL_SUFFIXES = Object.freeze({
  usageStore: "__haiRouterUsageStore",
  refreshLocks: "__haiRouterRefreshLocks",
  rateLimitLanes: "__haiRouterRateLimitLanes",
  keyedLocks: "__haiRouterKeyedLocks",
  laneRegistry: "__haiRouterLaneRegistry",
  providerPacing: "__haiRouterProviderPacing",
  bgTokenRefresh: "__haiRouterBgTokenRefresh",
  mcpBridges: "__haiRouterMcpBridges",
  coworkMcpRegistryCache: "__haiRouterCoworkMcpRegistryCache",
});

/**
 * @param {keyof typeof CANONICAL_SUFFIXES} name
 * @param {*} [initial]
 */
export function getRuntimeGlobalStore(name, initial = {}) {
  const canonical = CANONICAL_SUFFIXES[name];
  const legacy = LEGACY_SUFFIXES[name];
  if (!canonical) throw new Error(`Unknown runtime global: ${name}`);

  if (globalThis[canonical] == null && globalThis[legacy] != null) {
    globalThis[canonical] = globalThis[legacy];
  }
  if (globalThis[canonical] == null) {
    globalThis[canonical] = initial;
  }
  return globalThis[canonical];
}

/** @param {keyof typeof CANONICAL_SUFFIXES} name */
export function clearRuntimeGlobalStoreForTests(name) {
  const canonical = CANONICAL_SUFFIXES[name];
  const legacy = LEGACY_SUFFIXES[name];
  if (canonical) delete globalThis[canonical];
  if (legacy) delete globalThis[legacy];
}
