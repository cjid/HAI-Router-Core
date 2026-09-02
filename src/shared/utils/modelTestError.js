import { sanitizeUpstreamMessage } from "open-sse/errors/sanitize.js";

/** Normalize only facts returned by the test request; never invent retry state. */
export function normalizeModelTestError({
  status,
  message,
  providerCode = null,
  retryAt = null,
  retryAttempt = null,
  retryMaxAttempts = null,
} = {}) {
  const httpStatus = Number.isFinite(Number(status)) ? Number(status) : null;
  const providerMessage = sanitizeUpstreamMessage(message || "Model not reachable", {
    stripProvider: false,
    maxLen: 512,
  });
  const hasScheduledRetry = Boolean(
    retryAt && Number.isInteger(retryAttempt) && Number.isInteger(retryMaxAttempts),
  );
  return {
    httpStatus,
    providerMessage,
    providerCode: providerCode ? sanitizeUpstreamMessage(providerCode, { stripProvider: false, maxLen: 120 }) : null,
    retryScheduled: hasScheduledRetry,
    retryAt: hasScheduledRetry ? retryAt : null,
    retryAttempt: hasScheduledRetry ? retryAttempt : null,
    retryMaxAttempts: hasScheduledRetry ? retryMaxAttempts : null,
  };
}
