/** Live fields are period-independent — safe to patch without touching totals. */
export const USAGE_LIVE_FIELDS = [
  "activeRequests",
  "recentRequests",
  "errorProvider",
  "pending",
];

/**
 * Apply an SSE frame to stats. Drops frames from a different period.
 * @param {object|null} prev
 * @param {object|null} data
 * @param {string} currentPeriod
 */
export function mergeRealtimeStats(prev, data, currentPeriod) {
  if (!data || typeof data !== "object") return prev;
  if (data.period && data.period !== currentPeriod) return prev;

  // Full snapshot: replace wholesale so no stale period field survives.
  if (data.kind !== "live") {
    const { kind, period, ...stats } = data;
    return stats;
  }

  // Live patch: never touch period-scoped fields.
  const next = { ...(prev || {}) };
  for (const field of USAGE_LIVE_FIELDS) {
    if (data[field] !== undefined) next[field] = data[field];
  }
  return next;
}
