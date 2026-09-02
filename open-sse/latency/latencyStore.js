/**
 * In-memory rolling latency metrics per provider+connection lane.
 * No per-chunk DB writes — hot state lives here only.
 */

import {
  LATENCY_EWMA_ALPHA,
  LATENCY_SAMPLE_MAX,
  LATENCY_DEGRADED_TTL_MS,
  LATENCY_RECOVERY_SUCCESSES,
  LATENCY_MIN_SAMPLES,
  HEALTH_STATE,
} from "./latencyConfig.js";

const lanes = new Map();

function laneKey(providerId, connectionId) {
  return `${providerId || "unknown"}:${connectionId || "unknown"}`;
}

function emptyLane() {
  return {
    requestCount: 0,
    recentSuccess: 0,
    recentFailure: 0,
    ewmaTtfb: null,
    ewmaTtft: null,
    ttftSamples: [],
    streamFailures: 0,
    healthState: HEALTH_STATE.HEALTHY,
    degradedUntil: 0,
    last429At: 0,
    consecutiveSuccesses: 0,
    lastUpdatedAt: 0,
  };
}

function ewma(prev, sample, alpha = LATENCY_EWMA_ALPHA) {
  if (prev == null || !Number.isFinite(prev)) return sample;
  return alpha * sample + (1 - alpha) * prev;
}

function pushSample(arr, value, max = LATENCY_SAMPLE_MAX) {
  arr.push(value);
  if (arr.length > max) arr.shift();
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function getLaneMetrics(providerId, connectionId) {
  const lane = lanes.get(laneKey(providerId, connectionId));
  if (!lane) return null;
  const sorted = [...lane.ttftSamples].sort((a, b) => a - b);
  return {
    requestCount: lane.requestCount,
    recentSuccess: lane.recentSuccess,
    recentFailure: lane.recentFailure,
    ewmaTtfb: lane.ewmaTtfb,
    ewmaTtft: lane.ewmaTtft,
    recent_p50: percentile(sorted, 50),
    recent_p95: percentile(sorted, 95),
    streamFailures: lane.streamFailures,
    healthState: lane.healthState,
    degradedUntil: lane.degradedUntil,
    last429At: lane.last429At,
  };
}

export function getHealthState(providerId, connectionId) {
  const lane = lanes.get(laneKey(providerId, connectionId)) || emptyLane();
  const now = Date.now();
  if (lane.healthState === HEALTH_STATE.RATE_LIMITED && lane.last429At && now - lane.last429At > 60_000) {
    lane.healthState = HEALTH_STATE.HEALTHY;
  }
  if (lane.healthState === HEALTH_STATE.DEGRADED_LATENCY && lane.degradedUntil && now > lane.degradedUntil) {
    lane.healthState = HEALTH_STATE.HEALTHY;
    lane.consecutiveSuccesses = 0;
  }
  return lane.healthState;
}

export function recordRateLimited(providerId, connectionId) {
  const key = laneKey(providerId, connectionId);
  const lane = lanes.get(key) || emptyLane();
  lane.healthState = HEALTH_STATE.RATE_LIMITED;
  lane.last429At = Date.now();
  lane.lastUpdatedAt = Date.now();
  lanes.set(key, lane);
}

export function recordTransportFailure(providerId, connectionId) {
  const key = laneKey(providerId, connectionId);
  const lane = lanes.get(key) || emptyLane();
  lane.healthState = HEALTH_STATE.UNHEALTHY_TRANSPORT;
  lane.recentFailure++;
  lane.lastUpdatedAt = Date.now();
  lanes.set(key, lane);
}

export function recordAuthFailure(providerId, connectionId) {
  const key = laneKey(providerId, connectionId);
  const lane = lanes.get(key) || emptyLane();
  lane.healthState = HEALTH_STATE.AUTH_FAILURE;
  lane.recentFailure++;
  lane.lastUpdatedAt = Date.now();
  lanes.set(key, lane);
}

/**
 * Record completed request latency observation.
 * @param {object} opts
 * @param {boolean} opts.success
 * @param {number} [opts.ttfbMs]
 * @param {number} [opts.ttftMs]
 * @param {boolean} [opts.streamFailed]
 * @param {number} [opts.status]
 */
export function recordLatencyObservation({
  providerId,
  connectionId,
  success = true,
  ttfbMs = null,
  ttftMs = null,
  streamFailed = false,
  status = null,
} = {}) {
  const key = laneKey(providerId, connectionId);
  const lane = lanes.get(key) || emptyLane();
  const now = Date.now();

  lane.requestCount++;
  lane.lastUpdatedAt = now;

  if (status === 429) {
    recordRateLimited(providerId, connectionId);
    return getLaneMetrics(providerId, connectionId);
  }

  if (!success) {
    lane.recentFailure++;
    lane.consecutiveSuccesses = 0;
    if (streamFailed) lane.streamFailures++;
    if (status === 401 || status === 403) {
      lane.healthState = HEALTH_STATE.AUTH_FAILURE;
    } else if (status >= 500 || status === 502 || status === 503 || status === 504) {
      lane.healthState = HEALTH_STATE.UNHEALTHY_TRANSPORT;
    }
    lanes.set(key, lane);
    return getLaneMetrics(providerId, connectionId);
  }

  lane.recentSuccess++;
  lane.consecutiveSuccesses++;

  if (Number.isFinite(ttfbMs) && ttfbMs >= 0) {
    lane.ewmaTtfb = ewma(lane.ewmaTtfb, ttfbMs);
  }
  if (Number.isFinite(ttftMs) && ttftMs >= 0) {
    lane.ewmaTtft = ewma(lane.ewmaTtft, ttftMs);
    pushSample(lane.ttftSamples, ttftMs);

    const baseline = lane.ewmaTtft ?? ttftMs;
    if (lane.requestCount >= LATENCY_MIN_SAMPLES && ttftMs > baseline * 2.5) {
      lane.healthState = HEALTH_STATE.DEGRADED_LATENCY;
      lane.degradedUntil = now + LATENCY_DEGRADED_TTL_MS;
      lane.consecutiveSuccesses = 0;
    } else if (
      lane.healthState === HEALTH_STATE.DEGRADED_LATENCY
      && lane.consecutiveSuccesses >= LATENCY_RECOVERY_SUCCESSES
    ) {
      lane.healthState = HEALTH_STATE.HEALTHY;
      lane.degradedUntil = 0;
    } else if (lane.healthState === HEALTH_STATE.HEALTHY || lane.healthState === HEALTH_STATE.DEGRADED_LATENCY) {
      if (lane.healthState !== HEALTH_STATE.DEGRADED_LATENCY) {
        lane.healthState = HEALTH_STATE.HEALTHY;
      }
    }
  }

  if (streamFailed) lane.streamFailures++;

  lanes.set(key, lane);
  return getLaneMetrics(providerId, connectionId);
}

export function resetLatencyStoreForTests() {
  lanes.clear();
}

export function getAllLaneMetricsForTests() {
  const out = {};
  for (const [k, v] of lanes) out[k] = { ...v, ttftSamples: [...v.ttftSamples] };
  return out;
}
