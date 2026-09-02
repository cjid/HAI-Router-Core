export {
  LATENCY_EWMA_ALPHA,
  LATENCY_MIN_SAMPLES,
  HEALTH_STATE,
  SCORE_WEIGHTS,
  TIMEOUT_CLAMPS,
} from "./latencyConfig.js";

export {
  getLaneMetrics,
  getHealthState,
  recordLatencyObservation,
  recordRateLimited,
  recordTransportFailure,
  recordAuthFailure,
  resetLatencyStoreForTests,
  getAllLaneMetricsForTests,
} from "./latencyStore.js";

export {
  computeConnectTimeoutMs,
  computeFirstByteTimeoutMs,
} from "./adaptiveTimeout.js";

export {
  scoreConnection,
  pickLatencyAwareConnection,
  estimateEffectiveLatencyMs,
} from "./latencyScoring.js";

export { createRequestTiming } from "./requestTiming.js";
