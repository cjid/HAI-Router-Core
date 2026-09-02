/**
 * Stream termination classification and partial-usage confidence semantics.
 */

import { hasValidUsage } from "../utils/usageTracking.js";

export const TERMINATION_REASON = {
  COMPLETED: "completed",
  CLIENT_CANCELLED: "client_cancelled",
  UPSTREAM_ABORTED: "upstream_aborted",
  UPSTREAM_TIMEOUT: "upstream_timeout",
  PROXY_FAILURE: "proxy_failure",
  TRANSPORT_FAILURE: "transport_failure",
  LOCAL_TIMEOUT: "local_timeout",
  LOCAL_POLICY_ABORT: "local_policy_abort",
  SERVER_SHUTDOWN: "server_shutdown",
  UNKNOWN_ABORT: "unknown_abort",
};

export const USAGE_STATUS = {
  FINAL: "final",
  PARTIAL: "partial",
  ESTIMATED: "estimated",
  UNAVAILABLE: "unavailable",
};

export const USAGE_SOURCE = {
  PROVIDER: "provider",
  OBSERVED: "observed",
  TOKENIZER: "tokenizer",
  MIXED: "mixed",
};

const metrics = {
  stream_completed: 0,
  stream_client_aborted: 0,
  stream_upstream_aborted: 0,
  stream_timeout: 0,
  stream_partial: 0,
  partial_usage_provider: 0,
  partial_usage_estimated: 0,
  partial_usage_unavailable: 0,
};

function bump(key) {
  if (metrics[key] !== undefined) metrics[key]++;
}

/**
 * Classify stream termination from pipe/disconnect context.
 * @param {object} ctx
 * @returns {{ terminationReason: string, requestStatus: string, detailStatus: string, penalizeProvider: boolean, metricKey: string }}
 */
export function classifyStreamTermination(ctx = {}) {
  const kind = ctx.kind || "unknown";
  const reason = String(ctx.reason || "");
  const errMsg = String(ctx.error?.message || ctx.error?.name || "");
  const combined = `${reason} ${errMsg}`.toLowerCase();

  if (kind === "complete") {
    if (ctx.clientConnected === false) {
      return {
        terminationReason: TERMINATION_REASON.CLIENT_CANCELLED,
        requestStatus: "partial",
        detailStatus: "partial",
        penalizeProvider: false,
        metricKey: "stream_client_aborted",
      };
    }
    return {
      terminationReason: TERMINATION_REASON.COMPLETED,
      requestStatus: "ok",
      detailStatus: "success",
      penalizeProvider: false,
      metricKey: "stream_completed",
    };
  }

  if (combined.includes("stream stall timeout") || combined.includes("first byte timeout")) {
    return {
      terminationReason: TERMINATION_REASON.UPSTREAM_TIMEOUT,
      requestStatus: "partial",
      detailStatus: "partial",
      penalizeProvider: true,
      metricKey: "stream_timeout",
    };
  }

  if (combined.includes("server shutdown") || combined.includes("shutting down")) {
    return {
      terminationReason: TERMINATION_REASON.SERVER_SHUTDOWN,
      requestStatus: "partial",
      detailStatus: "partial",
      penalizeProvider: false,
      metricKey: "stream_partial",
    };
  }

  if (combined.includes("local policy") || combined.includes("hedge loser")) {
    return {
      terminationReason: TERMINATION_REASON.LOCAL_POLICY_ABORT,
      requestStatus: "partial",
      detailStatus: "partial",
      penalizeProvider: false,
      metricKey: "stream_partial",
    };
  }

  const clientSignals = ["cancelled", "client_closed", "responseaborted"];
  const looksClient =
    kind === "disconnect" &&
    (ctx.clientConnected === false ||
      clientSignals.some((s) => combined.includes(s)));

  // Upstream already finished — ResponseAborted is normal SSE socket teardown, not user cancel.
  if (
    kind === "disconnect" &&
    combined.includes("responseaborted") &&
    ctx.upstreamEof &&
    ctx.streamStarted
  ) {
    return {
      terminationReason: TERMINATION_REASON.COMPLETED,
      requestStatus: "ok",
      detailStatus: "success",
      penalizeProvider: false,
      metricKey: "stream_completed",
    };
  }

  if (looksClient && !combined.includes("stall timeout")) {
    return {
      terminationReason: TERMINATION_REASON.CLIENT_CANCELLED,
      requestStatus: "partial",
      detailStatus: "partial",
      penalizeProvider: false,
      metricKey: "stream_client_aborted",
    };
  }

  if (
    combined.includes("econnreset") ||
    combined.includes("socket hang up") ||
    combined.includes("und_err") ||
    combined.includes("epipe") ||
    combined.includes("etimedout")
  ) {
    const isProxy = combined.includes("proxy");
    return {
      terminationReason: isProxy ? TERMINATION_REASON.PROXY_FAILURE : TERMINATION_REASON.TRANSPORT_FAILURE,
      requestStatus: "partial",
      detailStatus: "partial",
      penalizeProvider: !isProxy,
      metricKey: "stream_upstream_aborted",
    };
  }

  if (kind === "error" || kind === "disconnect") {
    return {
      terminationReason: TERMINATION_REASON.UPSTREAM_ABORTED,
      requestStatus: "partial",
      detailStatus: "partial",
      penalizeProvider: true,
      metricKey: "stream_upstream_aborted",
    };
  }

  return {
    terminationReason: TERMINATION_REASON.UNKNOWN_ABORT,
    requestStatus: "partial",
    detailStatus: "partial",
    penalizeProvider: false,
    metricKey: "stream_partial",
  };
}

/**
 * Resolve usage confidence/source for a terminal stream snapshot.
 */
export function resolveUsageConfidence({ usage, termination, contentLength, hadProviderUsage }) {
  const isComplete = termination?.terminationReason === TERMINATION_REASON.COMPLETED;

  if (usage?.estimated) {
    return { status: USAGE_STATUS.ESTIMATED, source: USAGE_SOURCE.TOKENIZER };
  }

  if (hadProviderUsage && isComplete) {
    return { status: USAGE_STATUS.FINAL, source: USAGE_SOURCE.PROVIDER };
  }

  if (hadProviderUsage) {
    return { status: USAGE_STATUS.PARTIAL, source: USAGE_SOURCE.PROVIDER };
  }

  if (contentLength > 0) {
    return { status: USAGE_STATUS.ESTIMATED, source: USAGE_SOURCE.TOKENIZER };
  }

  const inTok = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
  if (inTok > 0) {
    return { status: USAGE_STATUS.PARTIAL, source: USAGE_SOURCE.MIXED };
  }

  return { status: USAGE_STATUS.UNAVAILABLE, source: null };
}

/**
 * Build stream diagnostics for request detail / usage meta (sanitized).
 */
export function buildStreamStats(ctx = {}) {
  return {
    stream_started: !!ctx.streamStarted,
    chunks_received: ctx.chunkCount ?? 0,
    bytes_received: ctx.totalBytes ?? 0,
    duration_ms: ctx.durationMs ?? 0,
    last_chunk_age_ms: ctx.lastChunkAgeMs ?? null,
    client_connected: ctx.clientConnected ?? null,
  };
}

export function recordStreamTerminationMetrics(termination, usageConfidence) {
  if (termination?.metricKey) bump(termination.metricKey);
  if (termination?.terminationReason !== TERMINATION_REASON.COMPLETED) {
    bump("stream_partial");
  }
  if (usageConfidence?.status === USAGE_STATUS.PARTIAL && usageConfidence?.source === USAGE_SOURCE.PROVIDER) {
    bump("partial_usage_provider");
  } else if (usageConfidence?.status === USAGE_STATUS.ESTIMATED) {
    bump("partial_usage_estimated");
  } else if (usageConfidence?.status === USAGE_STATUS.UNAVAILABLE) {
    bump("partial_usage_unavailable");
  }
}

export function getStreamAbortMetrics() {
  return { ...metrics };
}

export function resetStreamAbortMetricsForTests() {
  for (const k of Object.keys(metrics)) metrics[k] = 0;
}

export function usageHasProviderAuthority(usage) {
  return hasValidUsage(usage) && !usage?.estimated;
}
