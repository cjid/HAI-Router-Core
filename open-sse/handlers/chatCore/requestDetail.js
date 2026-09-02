import { saveRequestUsage, appendRequestLog, saveRequestDetail } from "@/lib/usageDb.js";
import { COLORS } from "../../utils/stream.js";
import { canonicalizeUsage, normalizeUsage, ensurePartialUsage, ensureModelTestUsage } from "../../utils/usageTracking.js";
import { classifyLlmTurnType } from "@/shared/utils/llmTurnType.js";
import {
  classifyStreamTermination,
  resolveUsageConfidence,
  buildStreamStats,
  recordStreamTerminationMetrics,
} from "../../stream/streamAbort.js";

const OPTIONAL_PARAMS = [
  "temperature", "top_p", "top_k",
  "max_tokens", "max_completion_tokens",
  "thinking", "reasoning", "enable_thinking",
  "presence_penalty", "frequency_penalty",
  "seed", "stop", "tools", "tool_choice",
  "response_format", "prediction", "store", "metadata",
  "n", "logprobs", "top_logprobs", "logit_bias",
  "user", "parallel_tool_calls"
];

export function extractRequestConfig(body, stream) {
  const config = { messages: body.messages || [], model: body.model, stream };
  for (const param of OPTIONAL_PARAMS) {
    if (body[param] !== undefined) config[param] = body[param];
  }
  return config;
}

export function extractUsageFromResponse(responseBody) {
  if (!responseBody || typeof responseBody !== "object") return null;

  // Claude format
  if (responseBody.usage?.input_tokens !== undefined) {
    return {
      prompt_tokens: responseBody.usage.input_tokens || 0,
      completion_tokens: responseBody.usage.output_tokens || 0,
      cache_read_input_tokens: responseBody.usage.cache_read_input_tokens,
      cache_creation_input_tokens: responseBody.usage.cache_creation_input_tokens
    };
  }

  // OpenAI format
  if (responseBody.usage?.prompt_tokens !== undefined) {
    return {
      prompt_tokens: responseBody.usage.prompt_tokens || 0,
      completion_tokens: responseBody.usage.completion_tokens || 0,
      cached_tokens: responseBody.usage.prompt_tokens_details?.cached_tokens,
      reasoning_tokens: responseBody.usage.completion_tokens_details?.reasoning_tokens
    };
  }

  // Gemini format. Antigravity / gemini-cli wrap the payload in { response: {...} }.
  const usageMetadata = responseBody.usageMetadata || responseBody.response?.usageMetadata;
  if (usageMetadata) {
    return {
      prompt_tokens: usageMetadata.promptTokenCount || 0,
      completion_tokens: usageMetadata.candidatesTokenCount || 0,
      cached_tokens: usageMetadata.cachedContentTokenCount || 0,
      reasoning_tokens: usageMetadata.thoughtsTokenCount || 0
    };
  }

  return null;
}

export function normalizeDetailTokens(tokens) {
  if (!tokens || typeof tokens !== "object") {
    return { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, cache_creation_input_tokens: 0 };
  }
  const normalized = normalizeUsage(tokens);
  return canonicalizeUsage(normalized) || tokens;
}

/** Align request-detail token fields with usageHistory (incl. model_test estimates). */
export function resolvePersistedUsage({ tokens, requestKind, body, contentLength = 0 }) {
  if (requestKind !== "model_test") {
    return {
      tokens: tokens || { prompt_tokens: 0, completion_tokens: 0 },
      usageStatus: null,
      usageSource: null,
    };
  }
  const resolved = ensureModelTestUsage(tokens, { body, contentLength });
  if (!resolved?.estimated) {
    return { tokens: resolved, usageStatus: null, usageSource: null };
  }
  return {
    tokens: resolved,
    usageStatus: "estimated",
    usageSource: "tokenizer",
  };
}

export function buildRequestDetail(base, overrides = {}) {
  const detail = {
    provider: base.provider || "unknown",
    model: base.model || "unknown",
    connectionId: base.connectionId || undefined,
    timestamp: new Date().toISOString(),
    latency: base.latency || { ttft: 0, total: 0 },
    tokens: base.tokens || { prompt_tokens: 0, completion_tokens: 0 },
    request: base.request,
    providerRequest: base.providerRequest || null,
    providerResponse: base.providerResponse || null,
    response: base.response || {},
    pxpipe: base.pxpipe || undefined,
    status: base.status || "success",
    turnType: base.turnType || null,
    terminationReason: base.terminationReason || null,
    usageStatus: base.usageStatus || null,
    usageSource: base.usageSource || null,
    streamStats: base.streamStats || null,
    network: base.network || null,
    ...overrides,
  };
  detail.tokens = normalizeDetailTokens(detail.tokens);
  return detail;
}

// Build the "done" summary: duration, ttft, in/out tokens with cache breakdown
export function formatDoneLine({ usage, latency }) {
  const u = usage || {};
  const inTok = u.prompt_tokens ?? u.input_tokens ?? 0;
  const outTok = u.completion_tokens ?? u.output_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? u.cached_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheCreate = u.cache_creation_input_tokens ?? 0;
  let inStr = `IN ${inTok}`;
  if (cacheRead || cacheCreate) {
    const parts = [];
    if (cacheRead) parts.push(`↻${cacheRead}`);
    if (cacheCreate) parts.push(`+${cacheCreate}`);
    inStr += ` (CACHE ${parts.join(" ")})`;
  }
  const ttftStr = latency?.ttft ? ` · TTFT ${latency.ttft}ms` : "";
  return `DONE ${latency?.total ?? 0}ms${ttftStr} · ${inStr} · OUT ${outTok}`;
}

export function saveUsageStats({
  provider, model, tokens, connectionId, apiKey, endpoint,
  label = "USAGE", silent = false, turnType = null,
  finishReason = null, hasToolCalls = false, hasThinking = false, hasContent = false, status = "ok",
  usageStatus = null, usageSource = null, terminationReason = null, streamStats = null,
  body = null, contentLength = 0, sawToolCalls = false, requestKind = null,
}) {
  const hadStreamActivity = (streamStats?.chunks_received ?? 0) > 0 || (streamStats?.bytes_received ?? 0) > 0;
  let isPartial = status === "partial" || usageStatus === "partial" || usageStatus === "estimated";
  if (!isPartial && hadStreamActivity && terminationReason && terminationReason !== "completed") {
    isPartial = true;
    status = "partial";
  }
  let resolvedTokens = tokens;
  if (isPartial || hadStreamActivity) {
    resolvedTokens = ensurePartialUsage(tokens, {
      body,
      contentLength,
      totalBytes: streamStats?.bytes_received ?? 0,
      sawToolCalls: sawToolCalls || hasToolCalls,
      isPartial: isPartial || hadStreamActivity,
      chunkCount: streamStats?.chunks_received ?? 0,
    });
  }
  if (!resolvedTokens || typeof resolvedTokens !== "object") {
    if (!isPartial && !hadStreamActivity && requestKind !== "model_test") return;
    resolvedTokens = { prompt_tokens: 0, completion_tokens: 0 };
  }

  if (requestKind === "model_test") {
    resolvedTokens = ensureModelTestUsage(resolvedTokens, { body, contentLength });
  }

  const inTokens = resolvedTokens.input_tokens ?? resolvedTokens.prompt_tokens ?? 0;
  const outTokens = resolvedTokens.output_tokens ?? resolvedTokens.completion_tokens ?? 0;

  if (inTokens === 0 && outTokens === 0 && !isPartial && !hadStreamActivity && requestKind !== "model_test") return;

  const resolvedTurnType = turnType || classifyLlmTurnType({
    finishReason,
    hasToolCalls,
    hasThinking,
    hasContent,
    status: status === "partial" ? "partial" : status,
  });

  if (!silent) {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const accountSuffix = connectionId ? ` | account=${connectionId.slice(0, 8)}...` : "";
    const partialSuffix = isPartial ? " | partial" : "";
    console.log(`${COLORS.green}[${time}] 📊 [${label}] ${provider.toUpperCase()} | in=${inTokens} | out=${outTokens}${accountSuffix}${partialSuffix}${COLORS.reset}`);
  }

  const normalized = canonicalizeUsage(resolvedTokens) || {
    prompt_tokens: resolvedTokens.prompt_tokens ?? resolvedTokens.input_tokens ?? 0,
    completion_tokens: resolvedTokens.completion_tokens ?? resolvedTokens.output_tokens ?? 0
  };

  const usageMeta = {};
  if (resolvedTurnType) usageMeta.turnType = resolvedTurnType;
  if (usageStatus) usageMeta.usageStatus = usageStatus;
  if (usageSource) usageMeta.usageSource = usageSource;
  if (terminationReason) usageMeta.terminationReason = terminationReason;
  if (streamStats) usageMeta.streamStats = streamStats;
  if (resolvedTokens.estimated) usageMeta.usageEstimated = true;
  if (requestKind) usageMeta.requestKind = requestKind;

  saveRequestUsage({
    provider: provider || "unknown",
    model: model || "unknown",
    tokens: normalized,
    timestamp: new Date().toISOString(),
    connectionId: connectionId || undefined,
    apiKey: apiKey || undefined,
    endpoint: endpoint || null,
    status: status === "partial" ? "partial" : (status || "ok"),
    usageMeta,
  }).catch(() => {});
}

/**
 * Build usage + stream meta from terminal stream context.
 */
export function buildStreamTerminalMeta(terminalContext = {}, usage = null) {
  const termination = classifyStreamTermination(terminalContext);
  const usageConfidence = resolveUsageConfidence({
    usage,
    termination,
    contentLength: terminalContext.contentLength ?? 0,
    hadProviderUsage: terminalContext.hadProviderUsage,
  });
  recordStreamTerminationMetrics(termination, usageConfidence);
  const streamStats = buildStreamStats(terminalContext);
  return { termination, usageConfidence, streamStats };
}
