/**
 * Provider enablement helpers — mirrors Providers dashboard + UsageStats semantics.
 * providerStates[providerId] === false disables a provider (including noAuth free tier).
 */

export function isProviderEnabled(providerId, providerStates = {}) {
  return providerStates[providerId] !== false;
}

/** Connections usable in model pickers (active connection + provider not disabled). */
export function filterConnectionsForPicker(connections = [], providerStates = {}) {
  return (connections || []).filter(
    (c) => c.isActive !== false && isProviderEnabled(c.provider, providerStates),
  );
}
