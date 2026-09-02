import { getCachedTokens, getInputTokens } from "./requestDetailTokens.js";
import { getRequestStatusSemantic, getSemanticTextClass } from "./statusSemantic.js";

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmtMs(ms) {
  if (ms == null || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function fmtThroughput(tokPerSec) {
  if (!tokPerSec || !Number.isFinite(tokPerSec) || tokPerSec <= 0) return "—";
  return `${tokPerSec.toFixed(1)} tok/s`;
}

function fmtTokens(inTok, outTok, estimated = false) {
  const prefix = estimated ? "~" : "";
  return `${inTok.toLocaleString()} → ${prefix}${outTok.toLocaleString()}`;
}

/** Build OpenRouter-style metrics + timeline from a request detail record. */
export function buildRequestDetailMetrics(detail) {
  if (!detail) return null;

  const tokens = detail.tokens || {};
  const latency = detail.latency || {};
  const phases = latency.phases || {};
  const streamStats = detail.streamStats || {};

  const inputTokens = getInputTokens(tokens);
  const outputTokens = num(tokens.completion_tokens ?? tokens.output_tokens);
  const cachedTokens = getCachedTokens(tokens);
  const estimated = detail.usageSource === "tokenizer" || detail.usageStatus === "estimated";

  const totalMs = num(
    latency.total
    ?? phases.total_ms
    ?? streamStats.duration_ms,
  );

  const ttftMs = num(
    latency.ttft
    ?? phases.time_to_first_token_ms
    ?? phases.time_to_first_byte_ms,
  );

  const routingMs = num(phases.queue_wait_ms)
    + num(phases.routing_ms)
    + num(phases.pre_upstream_ms);

  const providerLatencyMs = num(
    phases.upstream_connect_ms
    ?? phases.time_to_first_byte_ms
    ?? ttftMs,
  );

  let generationMs = Math.max(0, totalMs - ttftMs);
  if (generationMs === 0 && streamStats.duration_ms > 0 && ttftMs > 0) {
    generationMs = Math.max(0, streamStats.duration_ms - Math.min(ttftMs, streamStats.duration_ms));
  }
  if (generationMs === 0 && outputTokens > 0 && totalMs > providerLatencyMs) {
    generationMs = Math.max(0, totalMs - providerLatencyMs);
  }

  const throughput = generationMs > 0 ? outputTokens / (generationMs / 1000) : 0;

  const isStreaming = detail.request?.stream === true
    || detail.response?.type === "streaming"
    || streamStats.stream_started === true;

  const finishReason = detail.response?.finish_reason
    || detail.response?.finishReason
    || (detail.status === "success" ? "stop" : null);

  const statusCode = detail.status === "success" ? 200
    : detail.status === "partial" ? 206
      : detail.status === "streaming" ? 102
        : detail.status === "error" ? 502
          : 200;

  const timelineTotal = Math.max(totalMs, routingMs + providerLatencyMs + generationMs, 1);

  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    estimated,
    totalMs,
    ttftMs,
    routingMs,
    providerLatencyMs,
    generationMs,
    throughput,
    isStreaming,
    finishReason,
    statusCode,
    terminationReason: detail.terminationReason || null,
    usageStatus: detail.usageStatus || null,
    chunksReceived: streamStats.chunks_received ?? null,
    bytesReceived: streamStats.bytes_received ?? null,
    timeline: [
      {
        id: "routing",
        label: "Routing",
        ms: routingMs,
        pct: (routingMs / timelineTotal) * 100,
        tone: "muted",
      },
      {
        id: "provider",
        label: detail.provider || "Provider",
        ms: providerLatencyMs,
        pct: (providerLatencyMs / timelineTotal) * 100,
        tone: "success",
        badge: statusCode,
      },
      {
        id: "generation",
        label: "Generation",
        ms: generationMs,
        pct: (generationMs / timelineTotal) * 100,
        tone: "primary",
        subtitle: outputTokens > 0
          ? `${estimated ? "~" : ""}${outputTokens.toLocaleString()} tokens · ${fmtThroughput(throughput)}`
          : streamStats.chunks_received
            ? `${streamStats.chunks_received} chunks · ${((streamStats.bytes_received || 0) / 1024).toFixed(1)} KB`
            : null,
      },
    ],
    fmt: { ms: fmtMs, throughput: fmtThroughput, tokens: fmtTokens },
  };
}

export function getRequestStatusLabel(detail) {
  if (!detail) return "unknown";
  if (detail.status === "streaming") return "in progress";
  if (detail.terminationReason === "client_cancelled") return "cancelled";
  if (detail.status === "partial") return "partial";
  if (detail.status === "error") return "error";
  return detail.status || "success";
}

export function getRequestStatusTone(detail) {
  const variant = getRequestStatusSemantic(detail);
  if (variant === "success") return "success";
  if (variant === "error") return "error";
  if (variant === "warning") return "warning";
  if (variant === "info") return "info";
  return "muted";
}

export function getRequestStatusTextClass(detail) {
  return getSemanticTextClass(getRequestStatusSemantic(detail));
}
