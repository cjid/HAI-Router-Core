import { ERROR_TYPES, DEFAULT_ERROR_MESSAGES } from "../config/errorConfig.js";
import {
  createInternalError,
  buildPublicErrorResponse,
  buildSseErrorBytes,
  normalizePublicError,
  buildPublicErrorHeaders,
  logInternalError,
  classifyTransportError,
  classifyUpstreamHttp,
  sanitizeUpstreamMessage,
  createHaiRequestId,
  resolvePublicMessage,
  resolveHaiCode,
  resolveOpenAiType,
  HAI_CODES,
} from "../errors/index.js";
import { FORMATS } from "../translator/formats.js";
import { ERROR_ORIGIN } from "../errors/haiErrorCodes.js";

/**
 * Build OpenAI-compatible error response body (HAI-normalized).
 * @deprecated Prefer buildPublicErrorResponse(createInternalError(...))
 */
export function buildErrorBody(statusCode, message, { requestId = null, haiCode = null, retryAfterMs = null } = {}) {
  const internal = createInternalError({
    requestId: requestId || createHaiRequestId(),
    statusCode,
    upstreamMessage: message,
    haiCode: haiCode || resolveHaiCode(statusCode),
    retryAfterMs,
  });
  return normalizePublicError(internal);
}

/**
 * Create HAI-normalized error Response.
 */
export function errorResponse(statusCode, message, options = {}) {
  const internal = createInternalError({
    requestId: options.requestId,
    statusCode,
    upstreamMessage: message,
    origin: options.origin ?? (statusCode >= 400 && statusCode < 500 ? ERROR_ORIGIN.ROUTER : ERROR_ORIGIN.UPSTREAM),
    haiCode: options.haiCode,
    retryAfterMs: options.retryAfterMs,
    phase: options.phase,
  });
  if (options.log) logInternalError(internal, options.log, options.reqTag);
  return buildPublicErrorResponse(internal, { clientFormat: options.clientFormat || FORMATS.OPENAI });
}

/**
 * Write HAI-normalized error to SSE stream.
 */
export async function writeStreamError(writer, statusCode, message, options = {}) {
  const internal = createInternalError({
    requestId: options.requestId,
    statusCode,
    upstreamMessage: message,
    haiCode: options.haiCode || HAI_CODES.stream_error,
    origin: options.origin,
    phase: "stream",
  });
  const bytes = buildSseErrorBytes(internal, { clientFormat: options.clientFormat || FORMATS.OPENAI });
  await writer.write(bytes);
}

/**
 * Parse upstream provider error response (internal — preserves raw upstream for logs).
 */
export async function parseUpstreamError(response, executor = null) {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }

  if (executor && typeof executor.parseError === "function") {
    try {
      const parsed = executor.parseError(response, bodyText);
      if (parsed && typeof parsed === "object") {
        const msg = parsed.message || DEFAULT_ERROR_MESSAGES[response.status] || `HTTP ${response.status}`;
        return {
          statusCode: parsed.status || response.status,
          message: msg,
          upstreamCode: parsed.code || parsed.type || null,
          resetsAtMs: parsed.resetsAtMs,
        };
      }
    } catch { /* fall through */ }
  }

  let message = "";
  let upstreamCode = null;
  try {
    const json = JSON.parse(bodyText);
    message = json.error?.message || json.message || (typeof json.error === "string" ? json.error : bodyText);
    upstreamCode = json.error?.code || json.error?.type || json.code || null;
  } catch {
    message = bodyText;
  }

  const messageStr = typeof message === "string" ? message : JSON.stringify(message);
  const finalMessage = messageStr || DEFAULT_ERROR_MESSAGES[response.status] || `HTTP ${response.status}`;

  const result = {
    statusCode: response.status,
    message: finalMessage,
    upstreamCode,
    upstreamStatus: response.status,
  };
  if (response.status === 429) {
    const retryAfter = response.headers?.get?.("Retry-After") || response.headers?.get?.("retry-after");
    const parsed = parseRetryAfterHeader(retryAfter);
    if (parsed?.retryAfterMs > 0) result.retryAfterMs = parsed.retryAfterMs;
  }
  return result;
}

export function parseRetryAfterHeader(value) {
  if (value == null || value === "") return null;
  const trimmed = String(value).trim();
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum) && asNum >= 0) {
    return { retryAfterMs: Math.round(asNum * 1000), retryAfterSec: asNum };
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    const retryAfterMs = Math.max(0, dateMs - Date.now());
    return { retryAfterMs, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
  }
  return null;
}

/**
 * Create error result for chatCore handler (HAI-normalized public response).
 */
export function createErrorResult(statusCode, message, resetsAtMs, context = {}) {
  const classified = context.origin
    ? { statusCode, haiCode: context.haiCode, origin: context.origin }
    : classifyUpstreamHttp(statusCode, { retryAfterMs: context.retryAfterMs });

  const origin = context.origin
    ?? (statusCode >= 400 && statusCode < 500 && !context.upstreamStatus
      ? ERROR_ORIGIN.ROUTER
      : classified.origin);

  const internal = createInternalError({
    requestId: context.requestId,
    statusCode: classified.statusCode ?? statusCode,
    upstreamMessage: message,
    upstreamCode: context.upstreamCode,
    upstreamStatus: context.upstreamStatus ?? statusCode,
    provider: context.provider,
    connectionId: context.connectionId,
    model: context.model,
    phase: context.phase,
    origin,
    haiCode: context.haiCode || classified.haiCode,
    retryAfterMs: context.retryAfterMs ?? (resetsAtMs ? Math.max(0, resetsAtMs - Date.now()) : null),
    cause: context.cause,
  });

  if (context.log) logInternalError(internal, context.log, context.reqTag);

  const publicBody = normalizePublicError(internal, { clientFormat: context.clientFormat || FORMATS.OPENAI });
  const response = new Response(JSON.stringify(publicBody), {
    status: internal.statusCode,
    headers: buildPublicErrorHeaders(internal),
  });

  const sanitized = internal.upstreamMessage
    ? sanitizeUpstreamMessage(internal.upstreamMessage, {
      stripProvider: origin === ERROR_ORIGIN.ROUTER,
    })
    : null;

  return {
    success: false,
    status: internal.statusCode,
    error: sanitized || publicBody.error?.message || resolvePublicMessage(internal.haiCode),
    requestId: internal.requestId,
    resetsAtMs,
    retryAfterMs: internal.retryAfterMs,
    response,
    internalError: internal,
  };
}

/**
 * All accounts unavailable — HAI-normalized with Retry-After.
 */
export function unavailableResponse(statusCode, message, retryAfter, retryAfterHuman, context = {}) {
  const retryAfterMs = Math.max(0, new Date(retryAfter).getTime() - Date.now());
  const internal = createInternalError({
    requestId: context.requestId,
    statusCode,
    upstreamMessage: `${message} (${retryAfterHuman})`,
    haiCode: statusCode === 429 ? HAI_CODES.rate_limited : HAI_CODES.route_unavailable,
    retryAfterMs,
    origin: context.origin,
    phase: "routing",
  });
  if (context.log) logInternalError(internal, context.log, context.reqTag);
  return buildPublicErrorResponse(internal, { clientFormat: context.clientFormat || FORMATS.OPENAI });
}

/**
 * Format provider error for **internal logs only** — never send to client verbatim.
 */
export function formatProviderError(error, provider, model, statusCode) {
  const code = statusCode || error.code || "FETCH_FAILED";
  const message = sanitizeUpstreamMessage(error.message || "Unknown error");
  const causeCode = error.cause?.code;
  const causeMsg = error.cause?.message ? sanitizeUpstreamMessage(error.cause.message) : null;
  const causeStr = causeCode || causeMsg ? ` (cause: ${[causeCode, causeMsg].filter(Boolean).join(": ")})` : "";
  return `[${code}] ${provider}/${model}: ${message}${causeStr}`;
}

/**
 * Build HAI error from transport/fetch failure.
 */
export function createTransportErrorResult(error, context = {}) {
  const classified = classifyTransportError(error);
  return createErrorResult(classified.statusCode, error.message, null, {
    ...context,
    origin: classified.origin,
    haiCode: classified.haiCode,
    cause: error.cause?.code || error.code || error.name,
    phase: context.phase || "upstream",
  });
}

/**
 * Build HAI error from parsed upstream HTTP error.
 */
export function createUpstreamErrorResult(parsed, context = {}) {
  const classified = classifyUpstreamHttp(parsed.statusCode, { retryAfterMs: parsed.retryAfterMs });
  return createErrorResult(parsed.statusCode, parsed.message, parsed.resetsAtMs, {
    ...context,
    upstreamCode: parsed.upstreamCode,
    upstreamStatus: parsed.upstreamStatus ?? parsed.statusCode,
    origin: classified.origin,
    haiCode: classified.haiCode,
    retryAfterMs: parsed.retryAfterMs,
    phase: context.phase || "upstream",
  });
}

export { createInternalError, buildPublicErrorResponse, buildSseErrorBytes, logInternalError, createHaiRequestId };
