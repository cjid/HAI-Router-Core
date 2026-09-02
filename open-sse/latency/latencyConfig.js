/** Latency telemetry, scoring, and adaptive timeout configuration. */

export const LATENCY_EWMA_ALPHA = 0.2;
export const LATENCY_SAMPLE_MAX = 64;
export const LATENCY_MIN_SAMPLES = 5;

/** Health recovery: consecutive successes to leave DEGRADED_LATENCY. */
export const LATENCY_RECOVERY_SUCCESSES = 3;

/** Degraded lane TTL when latency spike detected (ms). */
export const LATENCY_DEGRADED_TTL_MS = 60_000;

/** Scoring weights — derived from neutral defaults, not provider magic numbers. */
export const SCORE_WEIGHTS = {
  priority: 50,
  saturationActive: 400,
  saturationQueued: 200,
  degradedMultiplier: 1.5,
  recentFailureThreshold: 3,
  recentFailurePenalty: 800,
  rateLimitedPenalty: 10_000,
  unhealthyPenalty: 5_000,
  defaultEwmaTtftMs: 1500,
  defaultEwmaTtfbMs: 800,
};

/** Adaptive first-byte timeout clamps (ms). */
export const TIMEOUT_CLAMPS = {
  connectMinMs: 5_000,
  connectMaxMs: 120_000,
  firstByteMinMs: 8_000,
  firstByteMaxMs: 200_000,
  connectMultiplier: 2.0,
  firstByteMultiplier: 2.5,
};

export const HEALTH_STATE = {
  HEALTHY: "HEALTHY",
  DEGRADED_LATENCY: "DEGRADED_LATENCY",
  RATE_LIMITED: "RATE_LIMITED",
  UNHEALTHY_TRANSPORT: "UNHEALTHY_TRANSPORT",
  AUTH_FAILURE: "AUTH_FAILURE",
};
