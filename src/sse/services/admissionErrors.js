import {
  buildPublicErrorResponse,
  createInternalError,
  classifyAdmissionError,
  logInternalError,
  HAI_CODES,
} from "open-sse/errors/index.js";
import { errorResponse } from "open-sse/utils/error.js";
import {
  SchedulerOverloadError,
  QueueTimeoutError,
  RateLimitCooldownError,
  getSchedulerStats,
} from "open-sse/concurrency/index.js";
import { FORMATS } from "open-sse/translator/formats.js";

export function admissionErrorResponse(err, context = {}) {
  const classified = classifyAdmissionError(err);
  const internal = createInternalError({
    requestId: context.requestId,
    statusCode: classified.statusCode,
    upstreamMessage: err?.message,
    origin: classified.origin,
    haiCode: classified.haiCode,
    retryAfterMs: classified.retryAfterMs ?? err?.retryAfterMs,
    phase: "admission",
  });

  if (context.log) logInternalError(internal, context.log, context.reqTag);

  if (err instanceof RateLimitCooldownError) {
    internal.haiCode = HAI_CODES.rate_limited;
    internal.retryAfterMs = err.retryAfterMs || 1000;
  }
  if (err instanceof QueueTimeoutError) {
    internal.haiCode = HAI_CODES.queue_timeout;
    internal.retryAfterMs = err.queueTimeoutMs || internal.retryAfterMs || 5000;
    const lane = err.laneName || "unknown";
    const waitedMs = err.queueTimeoutMs || "unknown";
    const stats = err.laneStats || getSchedulerStats()?.lanes?.global;
    context.log?.warn?.(
      "ADMISSION",
      `Queue timeout after ${waitedMs}ms on lane "${lane}" (active=${stats?.active ?? "?"}/${stats?.capacity ?? "?"} queued=${stats?.queued ?? "?"})`,
    );
  }
  if (err instanceof SchedulerOverloadError) {
    internal.haiCode = HAI_CODES.capacity_exceeded;
    internal.retryAfterMs = internal.retryAfterMs || 10000;
    const stats = getSchedulerStats();
    context.log?.warn?.(
      "ADMISSION",
      `Capacity exceeded — global active=${stats?.lanes?.global?.active}/${stats?.lanes?.global?.capacity} queued=${stats?.lanes?.global?.queued}`,
    );
  }

  if (err?.name === "AbortError") {
    return errorResponse(499, "Request aborted", {
      requestId: context.requestId,
      haiCode: HAI_CODES.request_cancelled,
      clientFormat: context.clientFormat || FORMATS.OPENAI,
      log: context.log,
      reqTag: context.reqTag,
    });
  }

  return buildPublicErrorResponse(internal, { clientFormat: context.clientFormat || FORMATS.OPENAI });
}
