/** Client-safe Go Engine constants and pure helpers (no Node built-ins). */

export const MAX_WORKER_COUNT = 8;
export const MIN_WORKER_COUNT = 1;

export const WORKER_LIFECYCLE = Object.freeze({
  STARTING: "STARTING",
  READY: "READY",
  DRAINING: "DRAINING",
  STOPPING: "STOPPING",
  FAILED: "FAILED",
});

export function isGoEngineExplicitlyDisabled() {
  const v = process.env.HAI_GO_ENGINE ?? process.env.HAI_GO_ENGINE_ENABLED;
  return v === "0" || v === "false";
}

export function isGoEngineEnabled() {
  return !isGoEngineExplicitlyDisabled();
}

export function parseWorkerId(workerId) {
  const m = /^worker-(\d+)$/.exec(String(workerId || ""));
  return m ? Number(m[1]) : null;
}
