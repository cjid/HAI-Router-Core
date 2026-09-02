/** Worker topology mutation controls for Go Engine settings UI. */
import { MAX_WORKER_COUNT } from "@/lib/goEngine/constants.js";

export function canMutateWorkerTopology(status, { busy = false } = {}) {
  if (busy || !status) return false;
  const transition = ["STARTING", "STOPPING", "PAUSING", "RESTARTING"].includes(status.state);
  if (transition) return false;
  return status.state === "RUNNING" && status.health === "Healthy";
}

export function getAddWorkerDisabledReason(status, { busy = false } = {}) {
  if (busy) return "Another operation is in progress.";
  if (!status) return "Engine status unavailable.";
  if (status.state !== "RUNNING") return `Engine is ${status.state}.`;
  if (status.health !== "Healthy") return `Engine health is ${status.health}.`;
  if ((status.runningWorkers ?? 0) >= MAX_WORKER_COUNT) return "Maximum worker count reached.";
  return null;
}

export function getDeleteWorkerDisabledReason(status, worker, { busy = false } = {}) {
  if (busy) return "Another operation is in progress.";
  if (!status) return "Engine status unavailable.";
  if (status.state !== "RUNNING") return `Engine is ${status.state}.`;
  if (status.health !== "Healthy") return `Engine health is ${status.health}.`;
  if ((status.runningWorkers ?? 0) <= 1) return "At least one worker is required.";
  if (worker?.lifecycle === "DRAINING") return "Worker is draining.";
  return null;
}

export function canAddWorker(status, opts) {
  return canMutateWorkerTopology(status, opts) && !getAddWorkerDisabledReason(status, opts);
}

export function canDeleteWorker(status, worker, opts) {
  return canMutateWorkerTopology(status, opts) && !getDeleteWorkerDisabledReason(status, worker, opts);
}
