/**
 * Pure state helpers for Provider Safety card fetch/poll/mutation sequencing.
 * Keeps server snapshot separate from user draft edits.
 */

export const FETCH_MODE = Object.freeze({
  INITIAL: "initial",
  PROVIDER_SWITCH: "providerSwitch",
  POLL: "poll",
  SAVE_SUCCESS: "saveSuccess",
  RESET_SUCCESS: "resetSuccess",
});

export function providersListEqual(a = [], b = []) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left?.providerId !== right?.providerId) return false;
    if (left?.label !== right?.label) return false;
    if (left?.description !== right?.description) return false;
    if (left?.icon !== right?.icon) return false;
  }
  return true;
}

export function shouldShowSelectLoading({ initialLoading, providerSwitchLoading }) {
  return Boolean(initialLoading || providerSwitchLoading);
}

export function shouldSyncDraftFromFetch(mode) {
  return mode === FETCH_MODE.INITIAL
    || mode === FETCH_MODE.PROVIDER_SWITCH
    || mode === FETCH_MODE.SAVE_SUCCESS
    || mode === FETCH_MODE.RESET_SUCCESS;
}

export function shouldReplaceProvidersOnFetch(mode) {
  return mode === FETCH_MODE.INITIAL || mode === FETCH_MODE.PROVIDER_SWITCH;
}

export function isDirtyState(snapshot, draftMax) {
  if (!snapshot) return false;
  const effective = snapshot.effectiveProviderMax ?? snapshot.limit ?? null;
  if (effective == null) return false;
  return draftMax !== effective;
}

export function pickSnapshotFromResponse(data) {
  if (!data) return null;
  return {
    providerId: data.providerId,
    safetyKey: data.safetyKey,
    effectiveProviderMax: data.effectiveProviderMax ?? data.limit ?? 1,
    configuredProviderMax: data.configuredProviderMax ?? null,
    recommendedProviderMax: data.recommendedProviderMax ?? null,
    canonicalDefault: data.canonicalDefault ?? null,
    managedBy: data.managedBy ?? "default",
    protectionEnabled: data.protectionEnabled ?? true,
    hasOverride: data.hasOverride ?? false,
    recommendationNote: data.recommendationNote ?? null,
    editable: data.editable !== false,
    active: data.active ?? 0,
    queued: data.queued ?? 0,
    limit: data.limit ?? data.effectiveProviderMax ?? 1,
    maxAllowed: data.maxAllowed ?? 64,
    providerHealth: data.providerHealth ?? "Unknown",
    cooldownRemainingMs: data.cooldownRemainingMs ?? 0,
    cooldownUntil: data.cooldownUntil ?? null,
    lastFailure: data.lastFailure ?? null,
    queueMax: data.queueMax,
    queueTimeoutMs: data.queueTimeoutMs,
  };
}

export function resolveDraftMaxFromResponse(data, fallback = 1) {
  return data?.effectiveProviderMax ?? data?.limit ?? fallback;
}

/**
 * Apply a fetch/mutation response to card state.
 * Returns the next state patch, or null when the response should be ignored.
 */
export function applyProviderSafetyFetchResult(state, {
  data,
  mode,
  capturedSelectionSeq,
  activeSelectionSeq,
  targetProviderId,
  mutationInFlight,
  mutationSeq,
  activeMutationSeq,
}) {
  if (capturedSelectionSeq !== activeSelectionSeq) return null;

  const responseProviderId = data?.providerId || targetProviderId;
  if (targetProviderId && responseProviderId !== targetProviderId) return null;

  if (mode === FETCH_MODE.POLL && mutationInFlight) return null;

  const snapshot = pickSnapshotFromResponse(data);
  if (!snapshot) return null;

  if ((mode === FETCH_MODE.SAVE_SUCCESS || mode === FETCH_MODE.RESET_SUCCESS)
    && mutationSeq !== activeMutationSeq) {
    return null;
  }

  const patch = {
    providerSwitchLoading: false,
    snapshot,
  };

  if (mode !== FETCH_MODE.POLL) {
    patch.initialLoading = false;
  }

  if (shouldReplaceProvidersOnFetch(mode)) {
    const incomingProviders = data.providers || [];
    if (!providersListEqual(state.providers, incomingProviders)) {
      patch.providers = incomingProviders;
    }
  }

  if (shouldSyncDraftFromFetch(mode)) {
    patch.draftMax = resolveDraftMaxFromResponse(data, state.draftMax);
  }

  return patch;
}

export { createPollScheduler } from "@/shared/utils/pollScheduler.js";
