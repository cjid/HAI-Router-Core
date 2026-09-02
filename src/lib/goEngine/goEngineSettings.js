import { getSettings, updateSettings } from "@/lib/db/repos/settingsRepo.js";
import { MAX_WORKER_COUNT, MIN_WORKER_COUNT } from "./constants.js";

export function clampWorkerCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n)) return MIN_WORKER_COUNT;
  return Math.max(MIN_WORKER_COUNT, Math.min(MAX_WORKER_COUNT, Math.trunc(n)));
}

/** Persisted settings win; env provides startup default only when unset. */
export async function resolveDesiredWorkerCount() {
  const settings = await getSettings();
  const persisted = settings?.goEngine?.desiredWorkerCount;
  if (persisted != null && persisted !== "") {
    return clampWorkerCount(persisted);
  }
  const env = process.env.HAI_GO_WORKER_COUNT;
  if (env != null && env !== "") {
    return clampWorkerCount(env);
  }
  return MIN_WORKER_COUNT;
}

export async function persistDesiredWorkerCount(count) {
  const settings = await getSettings();
  const goEngine = {
    ...(settings.goEngine || {}),
    desiredWorkerCount: clampWorkerCount(count),
  };
  await updateSettings({ goEngine });
}

export { MAX_WORKER_COUNT, MIN_WORKER_COUNT };
