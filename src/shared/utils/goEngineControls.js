/** Deterministic Go Engine lifecycle button enablement from canonical engine state. */
export function getGoEngineControls(state, { busy = false } = {}) {
  const transition = ["STARTING", "STOPPING", "PAUSING", "RESTARTING"].includes(state);
  const locked = busy || transition;

  return {
    start: !locked && ["STOPPED", "FAILED"].includes(state),
    pause: !locked && state === "RUNNING",
    resume: !locked && state === "PAUSED",
    stop: !locked && !["STOPPED", "STOPPING"].includes(state),
    restart: !locked && ["RUNNING", "PAUSED"].includes(state),
  };
}
