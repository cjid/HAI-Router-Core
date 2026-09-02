/**
 * Load concurrency settings from DB + configure scheduler lanes.
 */

import {
  mergeConcurrencySettings,
  setRuntimeProviderSafety,
} from "open-sse/config/concurrencyConfig.js";
import { configureLanes, syncProviderLaneCapacities } from "open-sse/concurrency/index.js";

let lastGlobalKey = "";
let lastFullKey = "";
let configured = false;

export function buildConfigKey(cfg) {
  return JSON.stringify(cfg);
}

export function applyConcurrencyPolicy(settings) {
  const merged = mergeConcurrencySettings(settings);
  const cfg = {
    globalMax: merged.globalMax,
    providerMax: merged.providerMax,
    connectionMax: merged.connectionMax,
    queueMax: merged.queueMax,
    queueTimeoutMs: merged.queueTimeoutMs,
    fusionMaxParallel: merged.fusionMaxParallel,
  };

  setRuntimeProviderSafety({
    providerOverrides: merged.providerOverrides,
    globalProviderMax: cfg.providerMax,
  });

  const globalKey = buildConfigKey(cfg);
  const fullKey = `${globalKey}|${JSON.stringify(merged.providerOverrides || {})}`;

  if (!configured || globalKey !== lastGlobalKey) {
    configureLanes(cfg);
    lastGlobalKey = globalKey;
  }

  if (!configured || fullKey !== lastFullKey) {
    syncProviderLaneCapacities();
    lastFullKey = fullKey;
    configured = true;
  }

  return cfg;
}

export async function ensureConcurrencyPolicy(getSettingsFn) {
  const settings = await getSettingsFn();
  return applyConcurrencyPolicy(settings);
}

export function resetConcurrencyPolicyForTests() {
  lastGlobalKey = "";
  lastFullKey = "";
  configured = false;
}
