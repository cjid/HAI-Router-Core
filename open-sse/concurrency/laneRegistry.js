/**
 * Registry of global / per-provider / per-connection semaphores.
 */

import { Semaphore } from "./semaphore.js";
import { CONCURRENCY_DEFAULTS, getProviderConcurrencyOverride, getRuntimeProviderOverrides, setRuntimeProviderSafety } from "../config/concurrencyConfig.js";
import { getRuntimeGlobalStore, clearRuntimeGlobalStoreForTests } from "../shared/runtimeGlobals.js";

function getRegistryState() {
  return getRuntimeGlobalStore("laneRegistry", {
    providerLanes: new Map(),
    connectionLanes: new Map(),
    globalLane: null,
    fusionLane: null,
    config: { ...CONCURRENCY_DEFAULTS },
    shuttingDown: false,
  });
}

export function configureLanes(next = {}) {
  const state = getRegistryState();
  state.config = { ...CONCURRENCY_DEFAULTS, ...next };
  setRuntimeProviderSafety({
    providerOverrides: getRuntimeProviderOverrides(),
    globalProviderMax: state.config.providerMax,
  });
  state.globalLane = new Semaphore({
    capacity: state.config.globalMax,
    maxQueue: state.config.queueMax,
    queueTimeoutMs: state.config.queueTimeoutMs,
    name: "global",
  });
  state.fusionLane = new Semaphore({
    capacity: state.config.fusionMaxParallel,
    maxQueue: state.config.queueMax,
    queueTimeoutMs: state.config.queueTimeoutMs,
    name: "fusion",
  });
  state.providerLanes.clear();
  state.connectionLanes.clear();
}

export function getLaneConfig() {
  return { ...getRegistryState().config };
}

function getProviderLane(providerId) {
  const state = getRegistryState();
  const override = getProviderConcurrencyOverride(providerId);
  const desiredCapacity = override?.providerMax ?? state.config.providerMax;
  let sem = state.providerLanes.get(providerId);
  if (!sem) {
    sem = new Semaphore({
      capacity: desiredCapacity,
      maxQueue: state.config.queueMax,
      queueTimeoutMs: state.config.queueTimeoutMs,
      name: `provider:${providerId}`,
    });
    state.providerLanes.set(providerId, sem);
    return sem;
  }
  if (sem.capacity !== desiredCapacity) {
    sem.setCapacity(desiredCapacity);
  }
  return sem;
}

export function syncProviderLaneCapacities() {
  const state = getRegistryState();
  for (const providerId of [...state.providerLanes.keys()]) {
    getProviderLane(providerId);
  }
}

function getConnectionLane(connectionId) {
  const state = getRegistryState();
  if (!state.connectionLanes.has(connectionId)) {
    state.connectionLanes.set(connectionId, new Semaphore({
      capacity: state.config.connectionMax,
      maxQueue: Math.min(state.config.queueMax, 32),
      queueTimeoutMs: state.config.queueTimeoutMs,
      name: `conn:${connectionId}`,
    }));
  }
  return state.connectionLanes.get(connectionId);
}

export function getGlobalLane() {
  const state = getRegistryState();
  if (!state.globalLane) configureLanes();
  return state.globalLane;
}

export function getFusionLane() {
  const state = getRegistryState();
  if (!state.fusionLane) configureLanes();
  return state.fusionLane;
}

export function getProviderSemaphore(providerId) {
  if (!providerId) return null;
  return getProviderLane(providerId);
}

export function getConnectionSemaphore(connectionId) {
  if (!connectionId || connectionId === "noauth") return null;
  return getConnectionLane(connectionId);
}

/** Lane saturation stats for latency-aware routing. */
export function getProviderLaneStats(providerId) {
  const sem = getProviderSemaphore(providerId);
  return sem?.stats ?? null;
}

export function isProviderLaneSaturated(providerId) {
  const stats = getProviderLaneStats(providerId);
  if (!stats) return false;
  return stats.active >= stats.capacity;
}

/** Lane saturation stats for latency-aware routing. */
export function getConnectionLaneStats(connectionId) {
  const sem = getConnectionSemaphore(connectionId);
  return sem?.stats ?? null;
}

export function buildLaneStatsMap(connectionIds = []) {
  const map = {};
  for (const id of connectionIds) {
    if (id) map[id] = getConnectionLaneStats(id);
  }
  return map;
}

export function isShuttingDown() {
  return getRegistryState().shuttingDown;
}

export function shutdownLanes() {
  const state = getRegistryState();
  state.shuttingDown = true;
  state.globalLane?.shutdown();
  state.fusionLane?.shutdown();
  for (const s of state.providerLanes.values()) s.shutdown();
  for (const s of state.connectionLanes.values()) s.shutdown();
}

export function getAllLaneStats() {
  const state = getRegistryState();
  const stats = {
    config: getLaneConfig(),
    shuttingDown: state.shuttingDown,
    global: state.globalLane?.stats || null,
    fusion: state.fusionLane?.stats || null,
    providers: {},
    connections: {},
  };
  for (const [k, v] of state.providerLanes) stats.providers[k] = v.stats;
  for (const [k, v] of state.connectionLanes) stats.connections[k] = v.stats;
  return stats;
}

export function resetLanesForTests(cfg) {
  clearRuntimeGlobalStoreForTests("laneRegistry");
  configureLanes(cfg || CONCURRENCY_DEFAULTS);
}

// Eager init with defaults
configureLanes();
