import { FORMATS } from "../../translator/formats.js";
import { needsTranslation } from "../../translator/index.js";
import { createSSETransformStreamWithLogger, createPassthroughStreamWithLogger, resolveStreamFinalize } from "../../utils/stream.js";
import { pipeWithDisconnect } from "../../utils/streamHandler.js";
import { PROVIDERS } from "../../config/providers.js";
import { STREAM_STALL_TIMEOUT_MS } from "../../config/runtimeConfig.js";
import { buildAbortedResponsesTerminalBytes } from "../../utils/responsesStreamHelpers.js";
import { buildRequestDetail, extractRequestConfig, saveUsageStats, formatDoneLine, resolvePersistedUsage } from "./requestDetail.js";
import { classifyStreamTermination, resolveUsageConfidence, buildStreamStats, recordStreamTerminationMetrics, TERMINATION_REASON } from "../../stream/streamAbort.js";
import { ensurePartialUsage } from "../../utils/usageTracking.js";
import { saveRequestDetail, emitPendingStatsNow } from "@/lib/usageDb.js";
import { SSE_HEADERS_CORS as SSE_HEADERS } from "../../utils/sseConstants.js";
import { computeFirstByteTimeoutMs, recordLatencyObservation } from "../../latency/index.js";
import { createInternalError, buildPublicErrorResponse, buildSseErrorBytes, HAI_CODES } from "../../errors/index.js";
import { classifyLlmTurnType } from "@/shared/utils/llmTurnType.js";
import { buildNetworkMetaFromProxyOptions } from "@/lib/network/connectionProxy.js";

// Codex returns Responses API SSE → which client format to translate INTO, by request sourceFormat.
// Gemini-family all map to ANTIGRAVITY decoder; unknown sources fall back to OPENAI.
const CODEX_SOURCE_TO_TARGET = {
  [FORMATS.OPENAI_RESPONSES]: FORMATS.OPENAI_RESPONSES,
  [FORMATS.CLAUDE]: FORMATS.CLAUDE,
  [FORMATS.ANTIGRAVITY]: FORMATS.ANTIGRAVITY,
  [FORMATS.GEMINI]: FORMATS.ANTIGRAVITY,
  [FORMATS.GEMINI_CLI]: FORMATS.ANTIGRAVITY,
};

/**
 * Determine which SSE transform stream to use based on provider/format.
 */
function buildTransformStream({ provider, sourceFormat, targetFormat, userAgent, reqLogger, toolNameMap, customToolNames, model, connectionId, body, usageEstimateBody, onStreamComplete, apiKey, requestTiming }) {
  const isDroidCLI = userAgent?.toLowerCase().includes("droid") || userAgent?.toLowerCase().includes("codex-cli");
  // Responses-API providers (e.g. codex) emit Responses SSE → translate into client format
  const isResponsesProvider = PROVIDERS[provider]?.format === FORMATS.OPENAI_RESPONSES;
  const needsCodexTranslation = isResponsesProvider && targetFormat === FORMATS.OPENAI_RESPONSES && !isDroidCLI;

  if (needsCodexTranslation) {
    const codexTarget = CODEX_SOURCE_TO_TARGET[sourceFormat] || FORMATS.OPENAI;
    return createSSETransformStreamWithLogger(FORMATS.OPENAI_RESPONSES, codexTarget, provider, reqLogger, toolNameMap, model, connectionId, body, onStreamComplete, apiKey, customToolNames, requestTiming, usageEstimateBody);
  }

  if (needsTranslation(targetFormat, sourceFormat)) {
    return createSSETransformStreamWithLogger(targetFormat, sourceFormat, provider, reqLogger, toolNameMap, model, connectionId, body, onStreamComplete, apiKey, customToolNames, requestTiming, usageEstimateBody);
  }

  return createPassthroughStreamWithLogger(provider, reqLogger, model, connectionId, body, onStreamComplete, apiKey, requestTiming, usageEstimateBody);
}

/**
 * Handle streaming response — pipe provider SSE through transform stream to client.
 */
export async function handleStreamingResponse({ providerResponse, provider, model, sourceFormat, targetFormat, userAgent, body, stream, translatedBody, finalBody, requestStartTime, connectionId, apiKey, clientRawRequest, onRequestSuccess, reqLogger, toolNameMap, customToolNames, streamController, onStreamComplete, streamDetailId, pxpipe, reqTag, log, streamState, releaseAdmissionOnce, requestTiming, errorCtx, proxyOptions }) {
  if (onRequestSuccess) {
    Promise.resolve()
      .then(onRequestSuccess)
      .catch(err => {
        console.error("[ChatCore] onRequestSuccess failed:", err?.message || err);
      });
  }

  // When upstream returns HTML/text instead of SSE (e.g. Cloudflare 5xx error
  // page), piping it through the SSE transform stream causes Next.js
  // "failed to pipe response" and crashes the chat router. Read the body,
  // pull a short human-readable message from the <title>, sanitize it, and
  // return a clean JSON error instead. The message is stripped of HTML tags
  // and clamped so untrusted upstream text never reaches the client verbatim
  // (the UI may render error.message as HTML).
  const upstreamContentType = (providerResponse.headers.get('content-type') || '').toLowerCase();
  if (upstreamContentType && !upstreamContentType.includes('text/event-stream') && !upstreamContentType.includes('application/json')) {
    const bodyText = await providerResponse.text().catch(() => '');
    const titleMatch = bodyText.match(/<title>([^<]+)<\/title>/i);
    const sanitizedTitle = (titleMatch?.[1] || '').replace(/<[^>]*>/g, '').replace(/[\r\n]+/g, ' ').trim().slice(0, 160);
    const shortMsg = sanitizedTitle
      || (bodyText.length < 200 ? bodyText.replace(/<[^>]*>/g, '').trim().slice(0, 160) : `Upstream returned non-SSE response (${upstreamContentType})`);
    const status = providerResponse.status || 502;
    if (log?.errorLine) log.errorLine(reqTag, "✗", `BLOCKED ${status} · ${provider}/${model} · non-SSE (${upstreamContentType})\n    ${shortMsg}`);
    else console.warn(`[STREAM] ${provider} | ${model} | blocked pipe: ${shortMsg} [${status}]`);
    streamController?.handleError?.(new Error(`upstream non-SSE: ${status}`));
    const internal = createInternalError({
      requestId: errorCtx?.requestId,
      statusCode: status,
      upstreamMessage: shortMsg,
      provider,
      connectionId,
      model,
      phase: "stream_pre_pipe",
      haiCode: HAI_CODES.stream_error,
    });
    return {
      success: false,
      response: buildPublicErrorResponse(internal, { clientFormat: errorCtx?.clientFormat || sourceFormat }),
    };
  }

  const usageEstimateBody = finalBody || translatedBody || body;
  const transformStream = buildTransformStream({ provider, sourceFormat, targetFormat, userAgent, reqLogger, toolNameMap, customToolNames, model, connectionId, body, usageEstimateBody, onStreamComplete, apiKey, requestTiming });
  const finalizeStreamFn = resolveStreamFinalize(transformStream);

  // Responses passthrough: synthesize response.failed + [DONE] if the stream aborts/stalls before a terminal event
  const isResponsesPassthrough = sourceFormat === FORMATS.OPENAI_RESPONSES && targetFormat === FORMATS.OPENAI_RESPONSES;
  const onAbortTerminal = () => {
    if (isResponsesPassthrough) return buildAbortedResponsesTerminalBytes(errorCtx);
    const internal = createInternalError({
      requestId: errorCtx?.requestId,
      statusCode: 502,
      haiCode: HAI_CODES.stream_error,
      phase: "stream",
      provider,
      connectionId,
      model,
    });
    return buildSseErrorBytes(internal, { clientFormat: errorCtx?.clientFormat || sourceFormat });
  };
  const stallTimeoutMs = PROVIDERS[provider]?.stallTimeoutMs || STREAM_STALL_TIMEOUT_MS;
  const firstByteTimeoutMs = computeFirstByteTimeoutMs(provider, connectionId);
  const transformedBody = pipeWithDisconnect(
    providerResponse,
    transformStream,
    streamController,
    onAbortTerminal,
    stallTimeoutMs,
    () => emitPendingStatsNow(),
    streamState,
    requestTiming,
    firstByteTimeoutMs,
    finalizeStreamFn,
  );

  saveRequestDetail(buildRequestDetail({
    provider, model, connectionId,
    latency: { ttft: 0, total: Date.now() - requestStartTime },
    tokens: { prompt_tokens: 0, completion_tokens: 0 },
    request: extractRequestConfig(body, stream),
    providerRequest: finalBody || translatedBody || null,
    providerResponse: "[Streaming - raw response not captured]",
    response: { content: "[Streaming in progress...]", thinking: null, type: "streaming" },
    pxpipe,
    status: "streaming",
    network: buildNetworkMetaFromProxyOptions(proxyOptions),
  }, { id: streamDetailId })).catch(err => {
    console.error("[RequestDetail] Failed to save streaming request:", err.message);
  });

  return {
    success: true,
    response: new Response(transformedBody, { headers: SSE_HEADERS }),
    latencyRecorded: true,
  };
}

/**
 * Build onStreamComplete callback for streaming usage tracking.
 */
export function buildOnStreamComplete({ provider, model, connectionId, apiKey, requestStartTime, body, stream, finalBody, translatedBody, clientRawRequest, pxpipe, reqTag, log, requestTiming, requestKind = null, proxyOptions }) {
  const streamDetailId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const usageEstimateBody = finalBody || translatedBody || body;

  const onStreamComplete = (contentObj, usage, ttftAt, terminalContext = null) => {
    const phases = requestTiming?.phases?.() || null;
    const latency = requestTiming?.toLatencyRecord?.() || {
      ttft: ttftAt ? ttftAt - requestStartTime : Date.now() - requestStartTime,
      total: Date.now() - requestStartTime,
    };
    if (phases) latency.phases = phases;

    let termination;
    let streamStats;
    try {
      termination = classifyStreamTermination(terminalContext || {});
      streamStats = buildStreamStats(terminalContext || {});
      const streamHadBytes = (streamStats?.bytes_received ?? 0) > 0 || (streamStats?.chunks_received ?? 0) > 0;
      if (
        termination.terminationReason === TERMINATION_REASON.COMPLETED
        && streamHadBytes
        && terminalContext?.clientConnected === false
        && !terminalContext?.hadProviderUsage
        && !(contentObj?.content || "").length
        && !contentObj?.hasToolCalls
      ) {
        termination = {
          terminationReason: TERMINATION_REASON.CLIENT_CANCELLED,
          requestStatus: "partial",
          detailStatus: "partial",
          penalizeProvider: false,
          metricKey: "stream_client_aborted",
        };
      }
    } catch (err) {
      console.error("[StreamComplete] termination classification failed:", err?.message || err);
      termination = {
        terminationReason: TERMINATION_REASON.UNKNOWN_ABORT,
        requestStatus: "partial",
        detailStatus: "partial",
        penalizeProvider: false,
        metricKey: "stream_partial",
      };
      streamStats = buildStreamStats(terminalContext || {});
    }

    const isSuccess = termination.terminationReason === TERMINATION_REASON.COMPLETED;

    let resolvedUsage;
    try {
      resolvedUsage = ensurePartialUsage(usage, {
        body: usageEstimateBody,
        contentLength: (contentObj?.content || "").length,
        totalBytes: streamStats?.bytes_received ?? terminalContext?.totalBytes ?? 0,
        sawToolCalls: contentObj?.hasToolCalls,
        isPartial: !isSuccess,
        chunkCount: streamStats?.chunks_received ?? terminalContext?.chunkCount ?? 0,
      });
    } catch (err) {
      console.error("[StreamComplete] ensurePartialUsage failed:", err?.message || err);
      resolvedUsage = usage && typeof usage === "object"
        ? usage
        : { prompt_tokens: 0, completion_tokens: 0 };
    }

    let usageConfidence = { status: null, source: null };
    try {
      usageConfidence = resolveUsageConfidence({
        usage: resolvedUsage,
        termination,
        contentLength: (contentObj?.content || "").length || streamStats?.bytes_received,
        hadProviderUsage: terminalContext?.hadProviderUsage,
      });
      recordStreamTerminationMetrics(termination, usageConfidence);
      recordLatencyObservation({
        providerId: provider,
        connectionId,
        success: isSuccess || !termination.penalizeProvider,
        streamFailed: !isSuccess && termination.penalizeProvider,
        ttfbMs: phases?.time_to_first_byte_ms,
        ttftMs: phases?.time_to_first_token_ms ?? latency.ttft,
      });
    } catch (err) {
      console.error("[StreamComplete] usage metrics failed:", err?.message || err);
    }

    const safeContent = contentObj?.content || (isSuccess ? "[Empty streaming response]" : "[Partial streaming response]");
    const safeThinking = contentObj?.thinking || null;
    const turnType = classifyLlmTurnType({
      finishReason: contentObj?.finishReason,
      hasToolCalls: contentObj?.hasToolCalls,
      hasThinking: !!safeThinking,
      hasContent: !!contentObj?.content,
      status: isSuccess ? "success" : "partial",
    });

    const contentLen = (contentObj?.content || "").length;
    let persistedUsage = { tokens: resolvedUsage, usageStatus: null, usageSource: null };
    try {
      persistedUsage = resolvePersistedUsage({
        tokens: resolvedUsage,
        requestKind,
        body: usageEstimateBody,
        contentLength: contentLen,
      });
    } catch (err) {
      console.error("[StreamComplete] resolvePersistedUsage failed:", err?.message || err);
      persistedUsage = { tokens: resolvedUsage, usageStatus: null, usageSource: null };
    }
    const detailUsageStatus = persistedUsage.usageStatus || usageConfidence.status;
    const detailUsageSource = persistedUsage.usageSource || usageConfidence.source;

    const terminalDetail = buildRequestDetail({
      provider, model, connectionId,
      latency,
      tokens: persistedUsage.tokens,
      request: extractRequestConfig(body, stream),
      providerRequest: finalBody || translatedBody || null,
      providerResponse: safeContent,
      response: {
        content: safeContent,
        thinking: safeThinking,
        type: "streaming",
        finish_reason: contentObj?.finishReason || null,
      },
      turnType,
      pxpipe,
      status: termination.detailStatus,
      terminationReason: termination.terminationReason,
      usageStatus: detailUsageStatus,
      usageSource: detailUsageSource,
      streamStats,
      network: buildNetworkMetaFromProxyOptions(proxyOptions),
    }, { id: streamDetailId });

    saveRequestDetail(terminalDetail, { immediate: true }).catch((err) => {
      console.error("[RequestDetail] Failed to update streaming content:", err?.message || err);
    });

    try {
      saveUsageStats({
        provider,
        model,
        tokens: resolvedUsage,
        connectionId,
        apiKey,
        endpoint: clientRawRequest?.endpoint,
        label: "STREAM USAGE",
        silent: true,
        turnType,
        finishReason: contentObj?.finishReason,
        hasToolCalls: contentObj?.hasToolCalls,
        hasThinking: !!safeThinking,
        hasContent: !!contentObj?.content,
        status: termination.requestStatus,
        usageStatus: usageConfidence.status,
        usageSource: usageConfidence.source,
        terminationReason: termination.terminationReason,
        streamStats,
        body: usageEstimateBody,
        contentLength: (contentObj?.content || "").length,
        sawToolCalls: contentObj?.hasToolCalls,
        requestKind,
      });
    } catch (err) {
      console.error("[StreamComplete] saveUsageStats failed:", err?.message || err);
    }

    const doneSuffix = isSuccess ? "" : ` · ${termination.terminationReason}`;
    if (log?.line) log.line(reqTag, "📊", `${formatDoneLine({ usage: resolvedUsage, latency })}${doneSuffix}`);
  };

  return { onStreamComplete, streamDetailId };
}
