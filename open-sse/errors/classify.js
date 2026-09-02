/**
 * Classify errors from structured signals — not string heuristics alone.
 */

import { ERROR_ORIGIN } from "./haiErrorCodes.js";
import { HAI_CODES, resolveHaiCode } from "./haiErrorCodes.js";

const TRANSPORT_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ENOTFOUND",
  "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT",
]);

export function classifyTransportError(error) {
  const code = error?.cause?.code || error?.code || "";
  const name = error?.name || "";
  if (name === "AbortError") {
    return { statusCode: 499, origin: ERROR_ORIGIN.ROUTER, haiCode: HAI_CODES.request_cancelled };
  }
  if (TRANSPORT_CODES.has(code) || /timeout|aborted|socket|connect/i.test(error?.message || "")) {
    const isTimeout = code === "ETIMEDOUT" || /timeout/i.test(error?.message || "");
    return {
      statusCode: isTimeout ? 504 : 502,
      origin: ERROR_ORIGIN.TRANSPORT,
      haiCode: isTimeout ? HAI_CODES.upstream_timeout : HAI_CODES.upstream_connection_error,
    };
  }
  return { statusCode: 502, origin: ERROR_ORIGIN.TRANSPORT, haiCode: HAI_CODES.upstream_connection_error };
}

export function classifyUpstreamHttp(statusCode, { retryAfterMs = null } = {}) {
  const origin = ERROR_ORIGIN.UPSTREAM;
  const haiCode = resolveHaiCode(statusCode, { origin });
  return { statusCode, origin, haiCode, retryAfterMs };
}

export function classifyAdmissionError(err) {
  if (err?.retryAfterMs != null) {
    return { statusCode: 429, origin: ERROR_ORIGIN.ADMISSION, haiCode: HAI_CODES.rate_limited, retryAfterMs: err.retryAfterMs };
  }
  if (err?.name === "QueueTimeoutError" || /queue/i.test(err?.message || "")) {
    return { statusCode: 503, origin: ERROR_ORIGIN.ADMISSION, haiCode: HAI_CODES.queue_timeout };
  }
  if (err?.name === "SchedulerOverloadError" || /capacity|overload/i.test(err?.message || "")) {
    return { statusCode: 503, origin: ERROR_ORIGIN.ADMISSION, haiCode: HAI_CODES.capacity_exceeded };
  }
  return { statusCode: 503, origin: ERROR_ORIGIN.ADMISSION, haiCode: HAI_CODES.capacity_exceeded };
}
