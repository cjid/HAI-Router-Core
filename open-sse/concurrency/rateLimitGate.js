/**
 * Per-lane rate-limit cooldown (provider + optional connection scope).
 * Unrelated lanes stay healthy when one account is cooling down.
 */

import { getRuntimeGlobalStore, clearRuntimeGlobalStoreForTests } from "../shared/runtimeGlobals.js";

function getLanesMap() {
  return getRuntimeGlobalStore("rateLimitLanes", new Map());
}

function laneKey(providerId, connectionId) {
  return connectionId ? `${providerId}|${connectionId}` : `${providerId}|*`;
}

export function setRateLimitCooldown(providerId, connectionId, retryAfterMs, reason = "429") {
  if (!providerId || !retryAfterMs || retryAfterMs <= 0) return;
  const until = Date.now() + retryAfterMs;
  const lanes = getLanesMap();
  const key = laneKey(providerId, connectionId);
  const existing = lanes.get(key);
  if (!existing || until > existing.until) {
    lanes.set(key, { until, reason, providerId, connectionId: connectionId || null });
  }
  // Also set provider-wide soft gate when connection-specific (shorter cap)
  if (connectionId) {
    const pk = laneKey(providerId, null);
    const provUntil = Date.now() + Math.min(retryAfterMs, 30_000);
    const pe = lanes.get(pk);
    if (!pe || provUntil > pe.until) lanes.set(pk, { until: provUntil, reason, providerId, connectionId: null });
  }
}

export function getRateLimitRemainingMs(providerId, connectionId) {
  if (!providerId) return 0;
  const lanes = getLanesMap();
  const keys = [laneKey(providerId, connectionId), laneKey(providerId, null)];
  let max = 0;
  const now = Date.now();
  for (const k of keys) {
    const e = lanes.get(k);
    if (e && e.until > now) max = Math.max(max, e.until - now);
  }
  return max;
}

export function isRateLimited(providerId, connectionId) {
  return getRateLimitRemainingMs(providerId, connectionId) > 0;
}

export function clearRateLimitGateForTests() {
  clearRuntimeGlobalStoreForTests("rateLimitLanes");
}

export function getRateLimitStats() {
  const lanes = getLanesMap();
  const now = Date.now();
  const active = [];
  for (const [key, e] of lanes) {
    if (e.until > now) active.push({ key, ...e, remainingMs: e.until - now });
  }
  return active;
}
