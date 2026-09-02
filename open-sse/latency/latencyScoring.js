/**
 * Latency-aware candidate scoring within eligible connections.
 * Does not replace eligibility — only ranks valid candidates.
 */

import { SCORE_WEIGHTS, HEALTH_STATE } from "./latencyConfig.js";
import { getLaneMetrics, getHealthState } from "./latencyStore.js";

/**
 * Estimate effective wait + TTFT for queue-aware ranking.
 */
export function estimateEffectiveLatencyMs({ metrics, laneStats }) {
  const ewmaTtft = metrics?.ewmaTtft ?? SCORE_WEIGHTS.defaultEwmaTtftMs;
  const capacity = Math.max(1, laneStats?.capacity ?? 4);
  const active = laneStats?.active ?? 0;
  const queued = laneStats?.queued ?? 0;

  const avgServiceMs = ewmaTtft;
  const queueWaitMs = queued > 0 ? (queued / capacity) * avgServiceMs : 0;
  const saturationWaitMs = active >= capacity ? avgServiceMs * 0.5 : 0;

  return Math.round(queueWaitMs + saturationWaitMs + ewmaTtft);
}

/**
 * Lower score = better candidate.
 */
export function scoreConnection(connection, { providerId, laneStatsByConnection = {} }) {
  const connectionId = connection.id;
  const metrics = getLaneMetrics(providerId, connectionId);
  const health = getHealthState(providerId, connectionId);
  const laneStats = laneStatsByConnection[connectionId] || null;

  const effectiveLatency = estimateEffectiveLatencyMs({ metrics, laneStats });

  let score = effectiveLatency;

  const capacity = Math.max(1, laneStats?.capacity ?? 4);
  const active = laneStats?.active ?? 0;
  const queued = laneStats?.queued ?? 0;
  score += (active / capacity) * SCORE_WEIGHTS.saturationActive;
  score += queued * SCORE_WEIGHTS.saturationQueued;

  if (health === HEALTH_STATE.DEGRADED_LATENCY) {
    score *= SCORE_WEIGHTS.degradedMultiplier;
  } else if (health === HEALTH_STATE.RATE_LIMITED) {
    score += SCORE_WEIGHTS.rateLimitedPenalty;
  } else if (health === HEALTH_STATE.UNHEALTHY_TRANSPORT) {
    score += SCORE_WEIGHTS.unhealthyPenalty;
  } else if (health === HEALTH_STATE.AUTH_FAILURE) {
    score += SCORE_WEIGHTS.unhealthyPenalty;
  }

  if ((metrics?.recentFailure ?? 0) >= SCORE_WEIGHTS.recentFailureThreshold) {
    score += SCORE_WEIGHTS.recentFailurePenalty;
  }

  score += (connection.priority ?? 999) * SCORE_WEIGHTS.priority;

  return { score, effectiveLatency, health, metrics };
}

/**
 * Pick best connection among eligible candidates by latency score.
 * Preserves input order on tie.
 */
export function pickLatencyAwareConnection(availableConnections, { providerId, laneStatsByConnection = {} }) {
  if (!availableConnections?.length) return null;
  if (availableConnections.length === 1) return availableConnections[0];

  let best = availableConnections[0];
  let bestScore = Infinity;

  for (const conn of availableConnections) {
    const { score } = scoreConnection(conn, { providerId, laneStatsByConnection });
    if (score < bestScore) {
      bestScore = score;
      best = conn;
    }
  }
  return best;
}
