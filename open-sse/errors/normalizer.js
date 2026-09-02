/**
 * HAI-Router error normalizer — internal canonical error → public client error.
 */

import { FORMATS } from "../translator/formats.js";
import {
  HAI_CODES,
  ERROR_ORIGIN,
  resolveHaiCode,
  resolveOpenAiType,
  resolvePublicMessage,
} from "./haiErrorCodes.js";
import { sanitizeUpstreamMessage } from "./sanitize.js";
import { createHaiRequestId } from "./requestId.js";

/**
 * @typedef {object} InternalError
 * @property {string} requestId
 * @property {number} statusCode
 * @property {string} [upstreamMessage]
 * @property {string} [upstreamCode]
 * @property {number} [upstreamStatus]
 * @property {string} [provider]
 * @property {string} [connectionId]
 * @property {string} [model]
 * @property {string} [phase]
 * @property {string} [origin]
 * @property {string} [haiCode]
 * @property {number} [retryAfterMs]
 * @property {string} [cause]
 */

export function createInternalError(fields = {}) {
  return {
    requestId: fields.requestId || createHaiRequestId(),
    statusCode: fields.statusCode ?? 500,
    upstreamMessage: fields.upstreamMessage ?? fields.message ?? null,
    upstreamCode: fields.upstreamCode ?? null,
    upstreamStatus: fields.upstreamStatus ?? fields.statusCode ?? null,
    provider: fields.provider ?? null,
    connectionId: fields.connectionId ?? null,
    model: fields.model ?? null,
    phase: fields.phase ?? null,
    origin: fields.origin ?? ERROR_ORIGIN.UPSTREAM,
    haiCode: fields.haiCode ?? resolveHaiCode(fields.statusCode ?? 500, { origin: fields.origin }),
    retryAfterMs: fields.retryAfterMs ?? null,
    cause: fields.cause ?? null,
  };
}

export function normalizePublicError(internal, { clientFormat = FORMATS.OPENAI } = {}) {
  const haiCode = internal.haiCode || resolveHaiCode(internal.statusCode, { origin: internal.origin });
  const message = (internal.origin === ERROR_ORIGIN.ROUTER && internal.upstreamMessage)
    ? sanitizeUpstreamMessage(internal.upstreamMessage, { stripProvider: false })
    : resolvePublicMessage(haiCode);
  const type = resolveOpenAiType(internal.statusCode);
  const openAiCode = haiCode;

  const base = {
    request_id: internal.requestId,
    type,
    code: openAiCode,
    message,
    retry_after_ms: internal.retryAfterMs ?? undefined,
  };

  if (clientFormat === FORMATS.CLAUDE) {
    return {
      type: "error",
      error: {
        type,
        message,
        request_id: internal.requestId,
      },
    };
  }

  if (clientFormat === FORMATS.OPENAI_RESPONSES) {
    return {
      error: {
        message,
        type,
        code: openAiCode,
        param: null,
        request_id: internal.requestId,
        ...(internal.retryAfterMs ? { retry_after_ms: internal.retryAfterMs } : {}),
      },
    };
  }

  // Default OpenAI chat completions compatible
  return {
    error: {
      message,
      type,
      code: openAiCode,
      param: null,
      request_id: internal.requestId,
      ...(internal.retryAfterMs ? { retry_after_ms: internal.retryAfterMs } : {}),
    },
  };
}

export function buildPublicErrorHeaders(internal) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "X-Request-Id": internal.requestId,
  };
  if (internal.retryAfterMs > 0) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(internal.retryAfterMs / 1000)));
  }
  return headers;
}

export function buildPublicErrorResponse(internal, options = {}) {
  const body = normalizePublicError(internal, options);
  return new Response(JSON.stringify(body), {
    status: internal.statusCode,
    headers: buildPublicErrorHeaders(internal),
  });
}

/** SSE error bytes for mid-stream failure (after headers sent). */
export function buildSseErrorBytes(internal, { clientFormat = FORMATS.OPENAI } = {}) {
  const encoder = new TextEncoder();
  const body = normalizePublicError(internal, { clientFormat });

  if (clientFormat === FORMATS.CLAUDE) {
    return encoder.encode(`event: error\ndata: ${JSON.stringify(body)}\n\n`);
  }

  if (clientFormat === FORMATS.OPENAI_RESPONSES) {
    const failed = {
      type: "response.failed",
      response: {
        id: internal.requestId,
        status: "failed",
        error: body.error,
      },
    };
    return encoder.encode(`event: response.failed\ndata: ${JSON.stringify(failed)}\n\n`);
  }

  return encoder.encode(`data: ${JSON.stringify(body)}\n\n`);
}

/** Internal log payload — provider allowed, sensitive values redacted. */
export function formatInternalErrorLog(internal) {
  return {
    request_id: internal.requestId,
    status: internal.statusCode,
    hai_code: internal.haiCode,
    origin: internal.origin,
    phase: internal.phase,
    provider: internal.provider,
    connection_id: internal.connectionId ? internal.connectionId.slice(0, 8) : null,
    model: internal.model,
    upstream_status: internal.upstreamStatus,
    upstream_code: internal.upstreamCode,
    upstream_message: sanitizeUpstreamMessage(internal.upstreamMessage),
    cause: internal.cause,
    retry_after_ms: internal.retryAfterMs,
  };
}

export function logInternalError(internal, log, reqTag = "") {
  const payload = formatInternalErrorLog(internal);
  const line = JSON.stringify(payload);
  if (log?.errorLine) log.errorLine(reqTag, "✗", `HAI_ERR ${line}`);
  else console.error(`[HAI_ERR] ${line}`);
}

export { HAI_CODES, ERROR_ORIGIN };
