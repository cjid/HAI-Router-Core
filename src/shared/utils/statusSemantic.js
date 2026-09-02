/**
 * Canonical semantic status → Badge variant / text utility classes.
 * Badge variants: success | error | warning | info | default (neutral)
 */

export const SEMANTIC_VARIANTS = Object.freeze({
  SUCCESS: "success",
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
  NEUTRAL: "default",
});

const ENGINE_STATE_MAP = {
  RUNNING: SEMANTIC_VARIANTS.SUCCESS,
  HEALTHY: SEMANTIC_VARIANTS.SUCCESS,
  STARTING: SEMANTIC_VARIANTS.INFO,
  RESTARTING: SEMANTIC_VARIANTS.INFO,
  PAUSING: SEMANTIC_VARIANTS.WARNING,
  PAUSED: SEMANTIC_VARIANTS.NEUTRAL,
  STOPPING: SEMANTIC_VARIANTS.WARNING,
  STOPPED: SEMANTIC_VARIANTS.NEUTRAL,
  DEGRADED: SEMANTIC_VARIANTS.WARNING,
  UNHEALTHY: SEMANTIC_VARIANTS.ERROR,
  FAILED: SEMANTIC_VARIANTS.ERROR,
  VERSION_MISMATCH: SEMANTIC_VARIANTS.ERROR,
};

const ENGINE_HEALTH_MAP = {
  Healthy: SEMANTIC_VARIANTS.SUCCESS,
  Degraded: SEMANTIC_VARIANTS.WARNING,
  Paused: SEMANTIC_VARIANTS.NEUTRAL,
  Pausing: SEMANTIC_VARIANTS.WARNING,
  Stopped: SEMANTIC_VARIANTS.NEUTRAL,
  Starting: SEMANTIC_VARIANTS.INFO,
  Stopping: SEMANTIC_VARIANTS.WARNING,
  Restarting: SEMANTIC_VARIANTS.INFO,
  Unhealthy: SEMANTIC_VARIANTS.ERROR,
};

const WORKER_HEALTH_MAP = {
  Healthy: SEMANTIC_VARIANTS.SUCCESS,
  Degraded: SEMANTIC_VARIANTS.WARNING,
  Restarting: SEMANTIC_VARIANTS.INFO,
  Draining: SEMANTIC_VARIANTS.WARNING,
  Paused: SEMANTIC_VARIANTS.NEUTRAL,
  Stopped: SEMANTIC_VARIANTS.NEUTRAL,
  Failed: SEMANTIC_VARIANTS.ERROR,
  Unhealthy: SEMANTIC_VARIANTS.ERROR,
  Unavailable: SEMANTIC_VARIANTS.ERROR,
};

const LOG_LEVEL_MAP = {
  DEBUG: SEMANTIC_VARIANTS.NEUTRAL,
  LOG: SEMANTIC_VARIANTS.NEUTRAL,
  INFO: SEMANTIC_VARIANTS.INFO,
  WARN: SEMANTIC_VARIANTS.WARNING,
  WARNING: SEMANTIC_VARIANTS.WARNING,
  ERROR: SEMANTIC_VARIANTS.ERROR,
  SUCCESS: SEMANTIC_VARIANTS.SUCCESS,
};

/** Event name → semantic level for Recent Engine Events (when level not stored). */
const ENGINE_EVENT_LEVEL_MAP = {
  engine_running: "success",
  worker_ready: "success",
  worker_restart_complete: "success",
  resumed: "success",
  shutdown_complete: "success",
  start_requested: "info",
  pause_requested: "info",
  shutdown_started: "info",
  worker_restart_started: "info",
  worker_draining: "warning",
  paused: "warning",
  start_failed: "error",
  worker_crashed: "error",
  worker_failed: "error",
  engine_failed: "error",
  provider_timeout: "error",
  tls_failure: "error",
  proxy_failure: "error",
  provider_retry: "warning",
};

const TEXT_CLASS = {
  success: "text-green-600 dark:text-green-400",
  error: "text-red-600 dark:text-red-400",
  warning: "text-yellow-600 dark:text-yellow-400",
  info: "text-blue-600 dark:text-blue-400",
  default: "text-text-muted",
};

const CONSOLE_TEXT_CLASS = {
  DEBUG: "text-text-muted",
  LOG: "text-text-muted",
  INFO: "text-blue-600 dark:text-blue-400",
  WARN: "text-yellow-600 dark:text-yellow-400",
  ERROR: "text-red-600 dark:text-red-400",
  SUCCESS: "text-green-600 dark:text-green-400",
};

function normalizeKey(value) {
  return String(value || "").trim();
}

/** Generic status → Badge variant (engine state, health strings, etc.). */
export function getStatusSemantic(status) {
  const key = normalizeKey(status).toUpperCase().replace(/\s+/g, "_");
  return ENGINE_STATE_MAP[key] || SEMANTIC_VARIANTS.NEUTRAL;
}

export function getEngineStateSemantic(state) {
  return getStatusSemantic(state);
}

export function getEngineHealthSemantic(health) {
  const key = normalizeKey(health);
  return ENGINE_HEALTH_MAP[key] || getStatusSemantic(key);
}

export function getWorkerHealthSemantic(health) {
  const key = normalizeKey(health);
  return WORKER_HEALTH_MAP[key] || getEngineHealthSemantic(key);
}

/** Active request count — never error unless backend marks overload (not inferred here). */
export function getActiveCountSemantic(count, { overloaded = false } = {}) {
  const n = Number(count) || 0;
  if (overloaded) return SEMANTIC_VARIANTS.WARNING;
  if (n > 0) return SEMANTIC_VARIANTS.INFO;
  return SEMANTIC_VARIANTS.NEUTRAL;
}

export function getEngineEventSemantic(event, level) {
  if (level) {
    const mapped = LOG_LEVEL_MAP[String(level).toUpperCase()];
    if (mapped) return mapped;
  }
  const key = normalizeKey(event).toLowerCase();
  const mapped = ENGINE_EVENT_LEVEL_MAP[key];
  if (mapped) return mapped;
  if (/fail|crash|error|timeout|mismatch/i.test(key)) return SEMANTIC_VARIANTS.ERROR;
  if (/pause|drain|retry|degrad/i.test(key)) return SEMANTIC_VARIANTS.WARNING;
  if (/start|restart|ready|running|resume|complete/i.test(key)) return SEMANTIC_VARIANTS.SUCCESS;
  return SEMANTIC_VARIANTS.INFO;
}

export function getLogLevelSemantic(level) {
  const key = String(level || "LOG").toUpperCase();
  return LOG_LEVEL_MAP[key] || SEMANTIC_VARIANTS.NEUTRAL;
}

export function getLogLevelTextClass(level) {
  const key = String(level || "LOG").toUpperCase();
  return CONSOLE_TEXT_CLASS[key] || CONSOLE_TEXT_CLASS.LOG;
}

/** Request detail status → Badge variant */
export function getRequestStatusSemantic(detail) {
  if (!detail) return SEMANTIC_VARIANTS.NEUTRAL;
  const status = detail.status;
  if (status === "streaming") return SEMANTIC_VARIANTS.INFO;
  if (detail.terminationReason === "client_cancelled") return SEMANTIC_VARIANTS.NEUTRAL;
  if (detail.terminationReason === "timeout" || detail.terminationReason === "upstream_timeout") {
    return SEMANTIC_VARIANTS.ERROR;
  }
  if (status === "partial") return SEMANTIC_VARIANTS.WARNING;
  if (status === "error") return SEMANTIC_VARIANTS.ERROR;
  if (status === "retrying") return SEMANTIC_VARIANTS.WARNING;
  if (status === "success" || status === "ok" || !status) return SEMANTIC_VARIANTS.SUCCESS;
  return SEMANTIC_VARIANTS.NEUTRAL;
}

/** Factual proxy health-test latency thresholds (single SSOT). */
export function getProxyLatencySemantic(latencyMs) {
  if (latencyMs == null || !Number.isFinite(Number(latencyMs))) {
    return SEMANTIC_VARIANTS.NEUTRAL;
  }
  const ms = Number(latencyMs);
  if (ms < 100) return SEMANTIC_VARIANTS.SUCCESS;
  if (ms < 300) return SEMANTIC_VARIANTS.INFO;
  if (ms <= 800) return SEMANTIC_VARIANTS.WARNING;
  return SEMANTIC_VARIANTS.WARNING;
}

export function getSemanticTextClass(variant) {
  return TEXT_CLASS[variant] || TEXT_CLASS.default;
}
