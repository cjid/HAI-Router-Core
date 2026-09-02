/**
 * HAI-Router public error taxonomy.
 * Maps HTTP status + origin → stable public codes.
 */

import { ERROR_TYPES } from "../config/errorConfig.js";

/** Public HAI codes — stable client-facing identifiers. */
export const HAI_CODES = {
  invalid_request: "hai_invalid_request",
  authentication_error: "hai_authentication_error",
  permission_denied: "hai_permission_denied",
  model_unavailable: "hai_model_unavailable",
  route_unavailable: "hai_route_unavailable",
  rate_limited: "hai_rate_limited",
  quota_exhausted: "hai_quota_exhausted",
  upstream_timeout: "hai_upstream_timeout",
  upstream_connection_error: "hai_upstream_connection_error",
  upstream_error: "hai_upstream_error",
  stream_error: "hai_stream_error",
  capacity_exceeded: "hai_capacity_exceeded",
  queue_timeout: "hai_queue_timeout",
  request_cancelled: "hai_request_cancelled",
  internal_error: "hai_internal_error",
};

/** Origin classification for internal diagnostics. */
export const ERROR_ORIGIN = {
  UPSTREAM: "upstream",
  ROUTER: "router",
  TRANSPORT: "transport",
  ADMISSION: "admission",
  INTERNAL: "internal",
};

const STATUS_TO_HAI = {
  400: HAI_CODES.invalid_request,
  401: HAI_CODES.authentication_error,
  402: HAI_CODES.quota_exhausted,
  403: HAI_CODES.permission_denied,
  404: HAI_CODES.model_unavailable,
  406: HAI_CODES.model_unavailable,
  408: HAI_CODES.upstream_timeout,
  409: HAI_CODES.route_unavailable,
  413: HAI_CODES.invalid_request,
  422: HAI_CODES.invalid_request,
  429: HAI_CODES.rate_limited,
  499: HAI_CODES.request_cancelled,
  500: HAI_CODES.internal_error,
  502: HAI_CODES.upstream_error,
  503: HAI_CODES.upstream_error,
  504: HAI_CODES.upstream_timeout,
};

const HAI_PUBLIC_MESSAGES = {
  [HAI_CODES.invalid_request]: "The request could not be processed.",
  [HAI_CODES.authentication_error]: "Authentication failed. Check your API credentials.",
  [HAI_CODES.permission_denied]: "You do not have permission to perform this action.",
  [HAI_CODES.model_unavailable]: "The requested model is currently unavailable.",
  [HAI_CODES.route_unavailable]: "The requested route is temporarily unavailable.",
  [HAI_CODES.rate_limited]: "The request is temporarily rate limited. Please retry later.",
  [HAI_CODES.quota_exhausted]: "Usage quota has been exhausted.",
  [HAI_CODES.upstream_timeout]: "The request timed out before a response was received.",
  [HAI_CODES.upstream_connection_error]: "Unable to reach the upstream service.",
  [HAI_CODES.upstream_error]: "The upstream service is temporarily unavailable.",
  [HAI_CODES.stream_error]: "The stream ended unexpectedly.",
  [HAI_CODES.capacity_exceeded]: "HAI-Router is currently at capacity. Please retry shortly.",
  [HAI_CODES.queue_timeout]: "The request timed out waiting in queue (default limit: 10 seconds). Please retry.",
  [HAI_CODES.request_cancelled]: "The request was cancelled.",
  [HAI_CODES.internal_error]: "An internal error occurred in HAI-Router.",
};

export function resolveHaiCode(statusCode, { origin = ERROR_ORIGIN.UPSTREAM, haiCodeOverride = null } = {}) {
  if (haiCodeOverride) return haiCodeOverride;
  if (origin === ERROR_ORIGIN.ADMISSION) {
    if (statusCode === 429) return HAI_CODES.rate_limited;
    if (statusCode === 503) return HAI_CODES.capacity_exceeded;
    return HAI_CODES.queue_timeout;
  }
  if (origin === ERROR_ORIGIN.TRANSPORT) {
    if (statusCode === 504 || statusCode === 408) return HAI_CODES.upstream_timeout;
    return HAI_CODES.upstream_connection_error;
  }
  if (origin === ERROR_ORIGIN.INTERNAL) return HAI_CODES.internal_error;
  return STATUS_TO_HAI[statusCode] || (statusCode >= 500 ? HAI_CODES.upstream_error : HAI_CODES.invalid_request);
}

export function resolveOpenAiType(statusCode) {
  return ERROR_TYPES[statusCode]?.type
    || (statusCode >= 500 ? "server_error" : "invalid_request_error");
}

export function resolvePublicMessage(haiCode) {
  return HAI_PUBLIC_MESSAGES[haiCode] || HAI_PUBLIC_MESSAGES[HAI_CODES.internal_error];
}
