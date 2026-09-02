/** Canonical async button process states — single source of truth. */
export const PROCESS_STATE = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
  ERROR: "error",
  DISABLED: "disabled",
  FETCHING: "fetching",
  SAVING: "saving",
  TESTING: "testing",
  IMPORTING: "importing",
  EXPORTING: "exporting",
  STARTING: "starting",
  PAUSING: "pausing",
  RESUMING: "resuming",
  STOPPING: "stopping",
  RESTARTING: "restarting",
});

/** States that show the processing spinner and block interaction. */
export const PROCESS_LOADING_STATES = new Set([
  PROCESS_STATE.LOADING,
  PROCESS_STATE.FETCHING,
  PROCESS_STATE.SAVING,
  PROCESS_STATE.TESTING,
  PROCESS_STATE.IMPORTING,
  PROCESS_STATE.EXPORTING,
  PROCESS_STATE.STARTING,
  PROCESS_STATE.PAUSING,
  PROCESS_STATE.RESUMING,
  PROCESS_STATE.STOPPING,
  PROCESS_STATE.RESTARTING,
]);

const DEFAULT_LOADING_LABELS = Object.freeze({
  [PROCESS_STATE.LOADING]: "Loading",
  [PROCESS_STATE.FETCHING]: "Fetching",
  [PROCESS_STATE.SAVING]: "Saving",
  [PROCESS_STATE.TESTING]: "Testing",
  [PROCESS_STATE.IMPORTING]: "Importing",
  [PROCESS_STATE.EXPORTING]: "Exporting",
  [PROCESS_STATE.STARTING]: "Starting",
  [PROCESS_STATE.PAUSING]: "Pausing",
  [PROCESS_STATE.RESUMING]: "Resuming",
  [PROCESS_STATE.STOPPING]: "Stopping",
  [PROCESS_STATE.RESTARTING]: "Restarting",
});

export function isProcessLoading(state) {
  return PROCESS_LOADING_STATES.has(state);
}

export function normalizeProcessState(state, { loading = false, disabled = false } = {}) {
  if (state && isProcessLoading(state)) return state;
  if (state === PROCESS_STATE.SUCCESS || state === PROCESS_STATE.ERROR) return state;
  if (disabled) return PROCESS_STATE.DISABLED;
  if (state) return state;
  if (loading) return PROCESS_STATE.LOADING;
  return PROCESS_STATE.IDLE;
}

export function resolveProcessIcon(processState, idleIcon) {
  if (isProcessLoading(processState)) return "progress_activity";
  if (processState === PROCESS_STATE.SUCCESS) return "check";
  if (processState === PROCESS_STATE.ERROR) return "close";
  return idleIcon || null;
}

/**
 * Resolve visible label from processLabels map.
 * On error, falls back to idle label (factual retry state) unless error label provided.
 */
export function resolveProcessLabel(processState, { processLabels, children } = {}) {
  const idle = processLabels?.idle ?? (typeof children === "string" ? children : "");
  if (!processState || processState === PROCESS_STATE.IDLE || processState === PROCESS_STATE.DISABLED) {
    return idle;
  }
  if (isProcessLoading(processState)) {
    return processLabels?.[processState]
      ?? DEFAULT_LOADING_LABELS[processState]
      ?? processLabels?.loading
      ?? "Loading";
  }
  if (processState === PROCESS_STATE.SUCCESS) {
    return processLabels?.success ?? idle;
  }
  if (processState === PROCESS_STATE.ERROR) {
    return processLabels?.error ?? idle;
  }
  return idle;
}

/** Reusable label maps for common async actions — stable width, no ellipsis. */
export const PROCESS_LABEL_PRESETS = Object.freeze({
  apply: Object.freeze({
    idle: "Apply",
    saving: "Applying",
    success: "Applied",
    error: "Apply",
  }),
  reset: Object.freeze({
    idle: "Reset",
    loading: "Resetting",
    success: "Reset",
    error: "Reset",
  }),
  save: Object.freeze({
    idle: "Save",
    saving: "Saving",
    success: "Saved",
    error: "Save",
  }),
  test: Object.freeze({
    idle: "Test",
    testing: "Testing",
    success: "Passed",
    error: "Test",
  }),
  addModel: Object.freeze({
    idle: "Add Model",
    saving: "Adding",
    success: "Added",
    error: "Add Model",
  }),
  createProvider: Object.freeze({
    idle: "Create Provider",
    saving: "Creating",
    success: "Created",
    error: "Create Provider",
  }),
  exportBackup: Object.freeze({
    idle: "Export Backup",
    exporting: "Exporting",
    success: "Exported",
    error: "Export Backup",
  }),
  testProxy: Object.freeze({
    idle: "Test proxy URL",
    testing: "Testing",
    success: "Passed",
    error: "Test proxy URL",
  }),
  confirm: Object.freeze({
    idle: "Confirm",
    loading: "Confirming",
    success: "Done",
    error: "Confirm",
  }),
  shutdown: Object.freeze({
    idle: "Shutdown",
    stopping: "Shutting down",
    success: "Shutting down",
    error: "Shutdown",
  }),
});

/** Min width in ch from longest label — prevents layout shift during state changes. */
export function resolveProcessMinWidthCh(processLabels, children) {
  if (!processLabels) return null;
  const candidates = [
    typeof children === "string" ? children : "",
    ...Object.values(processLabels),
  ].filter(Boolean);
  if (!candidates.length) return null;
  return Math.max(...candidates.map((s) => s.length)) + 0.5;
}
