/** Terminal request-detail statuses — must not revert to streaming from stale polls. */
export const TERMINAL_REQUEST_STATUSES = Object.freeze([
  "completed",
  "success",
  "error",
  "failed",
  "cancelled",
  "timeout",
]);

export function isTerminalRequestStatus(status) {
  if (!status) return false;
  return TERMINAL_REQUEST_STATUSES.includes(String(status).toLowerCase());
}

/**
 * Ignore late detail responses when selection changed or terminal state would regress.
 */
export function shouldApplyRequestDetailUpdate({
  capturedId,
  activeId,
  incomingStatus,
  currentStatus,
}) {
  if (!capturedId || capturedId !== activeId) return false;
  if (
    isTerminalRequestStatus(currentStatus)
    && String(incomingStatus).toLowerCase() === "streaming"
  ) {
    return false;
  }
  return true;
}

/**
 * Ignore stale list fetch when generation advanced (filters/page changed).
 */
export function shouldApplyListFetch({ capturedGeneration, activeGeneration }) {
  return capturedGeneration === activeGeneration;
}
