import { getRuntimeGlobalStore } from "@/shared/utils/runtimeGlobals.js";
import * as log from "../utils/logger.js";
import { getRefreshLeadMs } from "open-sse/services/tokenRefresh.js";
import { getCredentialExpiryMs } from "open-sse/services/oauthCredentialManager.js";

function getBgRefreshState() {
  return getRuntimeGlobalStore("bgTokenRefresh", {
    started: false,
    intervalHandle: null,
    initialTimeoutHandle: null,
    tickRunning: false,
  });
}

/** Refresh when expiry is within 30 minutes (or the provider on-request lead, whichever larger). */
export const BACKGROUND_REFRESH_LEAD_MS = 30 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const INITIAL_DELAY_MS = 10 * 1000;

function isTruthyEnv(value) {
  if (value == null || value === "") return false;
  const v = String(value).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function isNonServerRuntime() {
  if (typeof window !== "undefined") return true;
  const phase = process.env.NEXT_PHASE || "";
  if (
    phase === "phase-production-build" ||
    phase === "phase-export" ||
    phase === "phase-static"
  ) {
    return true;
  }
  // Next.js build / static generation markers
  if (process.env.NEXT_RUNTIME === "edge") return true;
  return false;
}

/**
 * Pure selection: OAuth connections with a refreshToken whose access token
 * expires within max(provider on-request lead, BACKGROUND_REFRESH_LEAD_MS).
 *
 * @param {Array<object>} connections
 * @param {number} [nowMs]
 * @returns {Array<object>}
 */
export function selectConnectionsNeedingRefresh(connections, nowMs = Date.now()) {
  if (!Array.isArray(connections) || connections.length === 0) return [];

  const out = [];
  for (const conn of connections) {
    if (!conn) continue;

    const authType = String(conn.authType || "").toLowerCase().replace(/_/g, "");
    if (authType !== "oauth") continue;
    if (!conn.refreshToken) continue;

    const expiresAtMs = getCredentialExpiryMs(conn);
    if (expiresAtMs === null) continue;

    const providerLead = getRefreshLeadMs(conn.provider);
    const leadMs = Math.max(
      Number.isFinite(providerLead) ? providerLead : 0,
      BACKGROUND_REFRESH_LEAD_MS
    );

    if (expiresAtMs - nowMs < leadMs) {
      out.push(conn);
    }
  }
  return out;
}

async function loadActiveConnections() {
  // Dynamic import avoids circular load with db / app graph at module eval time.
  const { getProviderConnections } = await import("../../lib/db/repos/connectionsRepo.js");
  return getProviderConnections({ isActive: true });
}

async function refreshOne(connection) {
  const { checkAndRefreshToken } = await import("./tokenRefresh.js");
  return checkAndRefreshToken(connection.provider, connection, { force: true });
}

/**
 * One scheduler tick. Fail-open at top level and per connection.
 * @param {{ loadConnections?: Function, refreshConnection?: Function }} [deps]
 */
export async function runBackgroundTokenRefreshTick(deps = {}) {
  const bg = getBgRefreshState();
  if (bg.tickRunning) {
    log.debug("BG_TOKEN_REFRESH", "Tick already running, skip");
    return;
  }
  bg.tickRunning = true;
  try {
    const load = deps.loadConnections || loadActiveConnections;
    const refresh = deps.refreshConnection || refreshOne;

    const connections = await load();
    const due = selectConnectionsNeedingRefresh(connections, Date.now());

    if (due.length === 0) {
      log.debug("BG_TOKEN_REFRESH", "No connections due for refresh", {
        active: Array.isArray(connections) ? connections.length : 0,
      });
      return;
    }

    log.info("BG_TOKEN_REFRESH", "Refreshing due OAuth connections", {
      due: due.length,
      ids: due.map((c) => c.id).filter(Boolean),
    });

    await Promise.allSettled(
      due.map(async (conn) => {
        try {
          await refresh(conn);
          log.info("BG_TOKEN_REFRESH", "Connection refresh finished", {
            id: conn.id,
            provider: conn.provider,
          });
        } catch (err) {
          log.warn("BG_TOKEN_REFRESH", "Connection refresh failed (swallowed)", {
            id: conn?.id,
            provider: conn?.provider,
            error: err?.message ?? String(err),
          });
        }
      })
    );
  } catch (err) {
    log.warn("BG_TOKEN_REFRESH", "Tick failed (swallowed)", {
      error: err?.message ?? String(err),
    });
  } finally {
    getBgRefreshState().tickRunning = false;
  }
}

/**
 * Start the background interval. Safe to call multiple times (no-op if already started).
 * @param {{ intervalMs?: number }} [opts]
 * @returns {boolean} true if started this call
 */
export function startBackgroundTokenRefresh({ intervalMs } = {}) {
  const bg = getBgRefreshState();
  if (bg.started) return false;
  if (isTruthyEnv(process.env.DISABLE_BACKGROUND_TOKEN_REFRESH)) {
    log.info("BG_TOKEN_REFRESH", "Disabled via DISABLE_BACKGROUND_TOKEN_REFRESH");
    return false;
  }
  if (isNonServerRuntime()) {
    log.debug("BG_TOKEN_REFRESH", "Skip start outside long-running server runtime");
    return false;
  }

  bg.started = true;
  const period = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS;

  const safeTick = () => {
    runBackgroundTokenRefreshTick().catch((err) => {
      log.warn("BG_TOKEN_REFRESH", "Unhandled tick rejection (swallowed)", {
        error: err?.message ?? String(err),
      });
    });
  };

  // First pass soon after boot so idle connections don't wait a full interval.
  bg.initialTimeoutHandle = setTimeout(safeTick, INITIAL_DELAY_MS);
  if (bg.initialTimeoutHandle.unref) bg.initialTimeoutHandle.unref();

  bg.intervalHandle = setInterval(safeTick, period);
  if (bg.intervalHandle.unref) bg.intervalHandle.unref();

  log.info("BG_TOKEN_REFRESH", "Scheduler started", {
    intervalMs: period,
    initialDelayMs: INITIAL_DELAY_MS,
    leadMs: BACKGROUND_REFRESH_LEAD_MS,
  });
  return true;
}

export function stopBackgroundTokenRefresh() {
  const bg = getBgRefreshState();
  if (bg.initialTimeoutHandle) {
    clearTimeout(bg.initialTimeoutHandle);
    bg.initialTimeoutHandle = null;
  }
  if (bg.intervalHandle) {
    clearInterval(bg.intervalHandle);
    bg.intervalHandle = null;
  }
  if (bg.started) {
    bg.started = false;
    log.info("BG_TOKEN_REFRESH", "Scheduler stopped");
  }
}
