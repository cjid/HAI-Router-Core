/**
 * Per-key async mutex — serializes RMW for one provider/account lane without
 * blocking unrelated keys.
 */

import { getRuntimeGlobalStore, clearRuntimeGlobalStoreForTests } from "../shared/runtimeGlobals.js";

function getLocksMap() {
  return getRuntimeGlobalStore("keyedLocks", new Map());
}

export async function withKeyedLock(key, fn) {
  const locks = getLocksMap();
  const k = String(key || "default");
  const prev = locks.get(k) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  locks.set(k, gate);

  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(k) === gate) locks.delete(k);
  }
}

export function clearKeyedLocksForTests() {
  clearRuntimeGlobalStoreForTests("keyedLocks");
}
