/**
 * SSE/chat admission scheduler — global → provider → connection lanes.
 */

import {
  configureLanes,
  getGlobalLane,
  getFusionLane,
  getProviderSemaphore,
  getConnectionSemaphore,
  getAllLaneStats,
  isShuttingDown,
  shutdownLanes,
  getLaneConfig,
} from "./laneRegistry.js";
import {
  getRateLimitRemainingMs,
  setRateLimitCooldown,
  isRateLimited,
  getRateLimitStats,
} from "./rateLimitGate.js";
import { RateLimitCooldownError, SchedulerOverloadError, QueueTimeoutError } from "./errors.js";
import { parseRetryAfterHeader } from "../utils/error.js";

const peakStats = { globalActive: 0, globalQueued: 0 };

function trackPeaks() {
  const g = getGlobalLane().stats;
  peakStats.globalActive = Math.max(peakStats.globalActive, g.active);
  peakStats.globalQueued = Math.max(peakStats.globalQueued, g.queued);
}

/**
 * Admit a chat/SSE request into the scheduler.
 * @param {object} opts
 * @param {string} opts.providerId
 * @param {string} [opts.connectionId] - bind later via ticket.bindConnection if unknown at admit time
 * @param {string} [opts.sessionId] - session identity for fair queueing across independent sessions
 * @param {AbortSignal} [opts.signal]
 * @param {boolean} [opts.fusionPanel] - use fusion parallel lane (does not consume global slot)
 * @returns {Promise<{ release: Function, bindConnection: Function, stats: object }>}
 */
export async function admit({
  providerId,
  connectionId = null,
  sessionId = null,
  signal = null,
  fusionPanel = false,
} = {}) {
  if (isShuttingDown()) {
    throw new SchedulerOverloadError("Server is shutting down");
  }
  if (!providerId) {
    throw new Error("admit requires providerId");
  }

  const cooldownMs = getRateLimitRemainingMs(providerId, connectionId);
  if (cooldownMs > 0) {
    throw new RateLimitCooldownError(
      `Rate limited for ${providerId}${connectionId ? `/${connectionId.slice(0, 8)}` : ""}`,
      cooldownMs,
    );
  }

  const releases = [];
  let released = false;

  const releaseAll = () => {
    if (released) return;
    released = true;
    while (releases.length) {
      try { releases.pop()(); } catch { /* idempotent */ }
    }
  };

  if (signal?.aborted) {
    throw Object.assign(new Error("Request aborted"), { name: "AbortError" });
  }
  const onAbort = () => releaseAll();
  signal?.addEventListener("abort", onAbort, { once: true });

  const acquireOpts = { signal, sessionId };

  try {
    if (fusionPanel) {
      releases.push(await getFusionLane().acquire(acquireOpts));
    } else {
      releases.push(await getGlobalLane().acquire(acquireOpts));
    }
    trackPeaks();

    const provSem = getProviderSemaphore(providerId);
    if (provSem) {
      releases.push(await provSem.acquire(acquireOpts));
      trackPeaks();
    }

    if (connectionId) {
      const connSem = getConnectionSemaphore(connectionId);
      if (connSem) releases.push(await connSem.acquire(acquireOpts));
    }

    let connRelease = null;

    const bindConnection = async (connId) => {
      if (released || !connId || connId === "noauth") return;
      if (connRelease) {
        connRelease();
        connRelease = null;
      }
      const connSem = getConnectionSemaphore(connId);
      if (!connSem) return;
      connRelease = await connSem.acquire(acquireOpts);
      releases.push(connRelease);
    };

    return {
      release: () => {
        signal?.removeEventListener("abort", onAbort);
        releaseAll();
      },
      bindConnection,
      stats: getSchedulerStats(),
    };
  } catch (err) {
    signal?.removeEventListener("abort", onAbort);
    releaseAll();
    throw err;
  }
}

export function recordUpstreamRateLimit(providerId, connectionId, response) {
  const header = response?.headers?.get?.("Retry-After") || response?.headers?.get?.("retry-after");
  const parsed = parseRetryAfterHeader(header);
  if (parsed?.retryAfterMs > 0) {
    setRateLimitCooldown(providerId, connectionId, parsed.retryAfterMs, "429");
  } else {
    setRateLimitCooldown(providerId, connectionId, 5_000, "429");
  }
}

export function getSchedulerStats() {
  return {
    peaks: { ...peakStats },
    lanes: getAllLaneStats(),
    rateLimits: getRateLimitStats(),
  };
}

export function resetSchedulerStatsForTests() {
  peakStats.globalActive = 0;
  peakStats.globalQueued = 0;
}

export {
  configureLanes,
  shutdownLanes,
  getLaneConfig,
  isRateLimited,
  setRateLimitCooldown,
  SchedulerOverloadError,
  QueueTimeoutError,
  RateLimitCooldownError,
};
