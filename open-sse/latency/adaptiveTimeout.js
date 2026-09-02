/**
 * Phase-specific adaptive timeouts derived from recent lane latency.
 */

import { STREAM_FIRST_CHUNK_TIMEOUT_MS, FETCH_CONNECT_TIMEOUT_MS } from "../config/runtimeConfig.js";
import { TIMEOUT_CLAMPS, LATENCY_MIN_SAMPLES } from "./latencyConfig.js";
import { getLaneMetrics } from "./latencyStore.js";

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function computeConnectTimeoutMs(providerId, connectionId) {
  const metrics = getLaneMetrics(providerId, connectionId);
  if (!metrics?.ewmaTtfb || metrics.requestCount < LATENCY_MIN_SAMPLES) {
    return FETCH_CONNECT_TIMEOUT_MS;
  }
  return clamp(
    Math.round(metrics.ewmaTtfb * TIMEOUT_CLAMPS.connectMultiplier),
    TIMEOUT_CLAMPS.connectMinMs,
    TIMEOUT_CLAMPS.connectMaxMs,
  );
}

export function computeFirstByteTimeoutMs(providerId, connectionId) {
  const metrics = getLaneMetrics(providerId, connectionId);
  if (!metrics?.ewmaTtfb || metrics.requestCount < LATENCY_MIN_SAMPLES) {
    return STREAM_FIRST_CHUNK_TIMEOUT_MS;
  }
  const base = metrics.ewmaTtfb ?? metrics.ewmaTtft;
  return clamp(
    Math.round(base * TIMEOUT_CLAMPS.firstByteMultiplier),
    TIMEOUT_CLAMPS.firstByteMinMs,
    TIMEOUT_CLAMPS.firstByteMaxMs,
  );
}
