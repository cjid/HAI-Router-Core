/**
 * Human-like inter-request pacing for shared free/no-auth provider endpoints.
 * Serializes dispatch gaps per provider so burst traffic from agents/IDEs does not
 * look like connection flooding to upstream (OpenCode, MiMo Free, etc.).
 *
 * Fail-open: unknown providers skip pacing; abort signals cancel the wait.
 */

import { getRuntimeGlobalStore, clearRuntimeGlobalStoreForTests } from "../shared/runtimeGlobals.js";

/** minGapMs + random(0..jitterMs) between upstream dispatches per provider. */
export const PROVIDER_PACING = {
  opencode: { minGapMs: 1200, jitterMs: 600 },
  "mimo-free": { minGapMs: 1000, jitterMs: 500 },
  mmf: { minGapMs: 1000, jitterMs: 500 },
};

function getStore() {
  return getRuntimeGlobalStore("providerPacing", {
    chains: new Map(),
    lastDispatch: new Map(),
  });
}

function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("Request aborted"), { name: "AbortError" }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("Request aborted"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Wait until the provider's pacing window allows the next upstream dispatch.
 * Chains concurrent waiters so gaps are enforced globally per provider.
 */
export async function waitForProviderPacing(providerId, { signal = null } = {}) {
  const cfg = PROVIDER_PACING[providerId];
  if (!cfg) return;

  const store = getStore();
  const prev = store.chains.get(providerId) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  store.chains.set(providerId, gate);

  await prev;
  try {
    const last = store.lastDispatch.get(providerId) || 0;
    const gap = cfg.minGapMs + Math.floor(Math.random() * (cfg.jitterMs + 1));
    const waitMs = Math.max(0, last + gap - Date.now());
    if (waitMs > 0) {
      await sleep(waitMs, signal);
    }
    store.lastDispatch.set(providerId, Date.now());
  } finally {
    release();
    if (store.chains.get(providerId) === gate) store.chains.delete(providerId);
  }
}

export function clearProviderPacingForTests() {
  clearRuntimeGlobalStoreForTests("providerPacing");
}

export function getProviderPacingConfig(providerId) {
  return PROVIDER_PACING[providerId] || null;
}
