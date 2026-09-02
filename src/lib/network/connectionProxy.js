import { getProxyPoolById } from "@/models";

// Safely normalize any value into a trimmed string.
function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

// ─── Proxy pool rotation state (in-memory) ─────────────────────────
const rotateState = new Map(); // providerId → { index }

/**
 * Pick one proxy pool ID from a list based on strategy.
 * round-robin: cycle sequentially (in-memory, resets on restart)
 * random:      uniform random pick
 * none/single: return first entry
 */
export function pickProxyPoolId(poolIds, strategy, providerId) {
  if (!poolIds || poolIds.length === 0) return null;
  if (poolIds.length === 1) return poolIds[0];

  if (strategy === "round-robin") {
    const state = rotateState.get(providerId) || { index: -1 };
    state.index = (state.index + 1) % poolIds.length;
    rotateState.set(providerId, state);
    return poolIds[state.index];
  }

  if (strategy === "random") {
    return poolIds[Math.floor(Math.random() * poolIds.length)];
  }

  return poolIds[0]; // "none" or unknown
}

/**
 * Normalize legacy proxy configuration.
 */
function normalizeLegacyProxy(providerSpecificData = {}) {
  const connectionProxyEnabled =
    providerSpecificData?.connectionProxyEnabled === true;

  const connectionProxyUrl = normalizeString(
    providerSpecificData?.connectionProxyUrl
  );

  const connectionNoProxy = normalizeString(
    providerSpecificData?.connectionNoProxy
  );

  return {
    connectionProxyEnabled,
    connectionProxyUrl,
    connectionNoProxy,
  };
}

/**
 * Resolve final proxy configuration.
 *
 * Priority:
 * 1. Proxy Pool
 * 2. Legacy Proxy
 * 3. No Proxy
 */
export async function resolveConnectionProxyConfig(
  providerSpecificData = {}
) {
  try {
    const proxyPoolIdRaw = normalizeString(
      providerSpecificData?.proxyPoolId
    );

    // "__none__" means explicitly disabled
    const proxyPoolId =
      proxyPoolIdRaw === "__none__" ? "" : proxyPoolIdRaw;

    const legacy = normalizeLegacyProxy(providerSpecificData);

    /**
     * -----------------------------
     * Proxy Pool Resolution
     * -----------------------------
     */
    if (proxyPoolId) {
      const proxyPool = await getProxyPoolById(proxyPoolId);

      const proxyUrl = normalizeString(proxyPool?.proxyUrl);
      const noProxy = normalizeString(proxyPool?.noProxy);

      const isValidPool =
        proxyPool &&
        proxyPool.isActive === true &&
        proxyUrl;

      if (isValidPool) {
        /**
         * Vercel/Cloudflare relay proxies use base URL rewriting
         * instead of HTTP_PROXY environment variables.
         */
        if (proxyPool.type === "vercel" || proxyPool.type === "cloudflare" || proxyPool.type === "deno") {
          return {
            source: proxyPool.type,

            proxyPoolId,
            proxyPool,

            connectionProxyEnabled: false,
            connectionProxyUrl: "",
            connectionNoProxy: noProxy,

            strictProxy: proxyPool.strictProxy === true,

            vercelRelayUrl: proxyUrl, // Still mapped to vercelRelayUrl in the unified payload since they use the exact same header spec
          };
        }

        /**
         * Standard proxy pool
         */
        return {
          source: "pool",

          proxyPoolId,
          proxyPool,

          connectionProxyEnabled: true,
          connectionProxyUrl: proxyUrl,
          connectionNoProxy: noProxy,

          strictProxy: proxyPool.strictProxy === true,
        };
      }
    }

    /**
     * -----------------------------
     * Legacy Proxy Fallback
     * -----------------------------
     */
    if (
      legacy.connectionProxyEnabled &&
      legacy.connectionProxyUrl
    ) {
      return {
        source: "legacy",

        proxyPoolId: proxyPoolId || null,
        proxyPool: null,

        strictProxy: false,
        ...legacy,
      };
    }

    /**
     * -----------------------------
     * No Proxy Config
     * -----------------------------
     */
    return {
      source: "none",

      proxyPoolId: proxyPoolId || null,
      proxyPool: null,

      strictProxy: false,
      ...legacy,
    };
  } catch (error) {
    console.error(
      "[resolveConnectionProxyConfig] Failed to resolve proxy config:",
      error
    );

    return {
      source: "error",

      proxyPoolId: null,
      proxyPool: null,

      connectionProxyEnabled: false,
      connectionProxyUrl: "",
      connectionNoProxy: "",

      strictProxy: false,
    };
  }
}

/** Canonical proxyOptions payload for proxyAwareFetch. */
export function buildProxyOptions(source = {}) {
  return {
    connectionProxyEnabled: source.connectionProxyEnabled === true,
    connectionProxyUrl: normalizeString(source.connectionProxyUrl),
    connectionNoProxy: normalizeString(source.connectionNoProxy),
    vercelRelayUrl: normalizeString(source.vercelRelayUrl),
    strictProxy: source.strictProxy === true,
    connectionProxyPoolId: source.connectionProxyPoolId || source.proxyPoolId || null,
  };
}

/** Build proxyOptions from flattened providerSpecificData on credentials. */
export function buildProxyOptionsFromCredentials(credentials) {
  const psd = credentials?.providerSpecificData || {};
  return buildProxyOptions({
    connectionProxyEnabled: psd.connectionProxyEnabled,
    connectionProxyUrl: psd.connectionProxyUrl,
    connectionNoProxy: psd.connectionNoProxy,
    vercelRelayUrl: psd.vercelRelayUrl,
    strictProxy: psd.strictProxy,
    connectionProxyPoolId: psd.connectionProxyPoolId,
  });
}

const EGRESS_CACHE_TTL_MS = 5 * 60 * 1000;
const egressCache = new Map();
/** @type {Map<string, number>} connectionId → monotonic egress generation */
const connectionEgressGenerations = new Map();
let nextEgressGeneration = 1;

/** Current egress generation for a connection (bumps on invalidate). */
export function getConnectionEgressGeneration(connectionId) {
  if (!connectionId) return 0;
  if (!connectionEgressGenerations.has(connectionId)) {
    connectionEgressGenerations.set(connectionId, nextEgressGeneration++);
  }
  return connectionEgressGenerations.get(connectionId);
}

function bumpConnectionEgressGeneration(connectionId) {
  if (!connectionId) return 0;
  const gen = nextEgressGeneration++;
  connectionEgressGenerations.set(connectionId, gen);
  return gen;
}

/** Attach provider/connection metadata for Go transport routing. */
export function enrichProxyOptions(proxyOptions, context = {}) {
  const base = buildProxyOptions(proxyOptions || {});
  const connectionId = normalizeString(context.connectionId);
  const providerId = normalizeString(context.providerId || context.provider);
  return {
    ...base,
    providerId,
    connectionId,
    sessionId: normalizeString(context.sessionId),
    egressGeneration: getConnectionEgressGeneration(connectionId),
  };
}

export function cacheConnectionEgress(connectionId, proxyOptions) {
  if (!connectionId || !proxyOptions) return;
  const gen = getConnectionEgressGeneration(connectionId);
  egressCache.set(connectionId, {
    proxyOptions: { ...buildProxyOptions(proxyOptions), egressGeneration: gen },
    expiresAt: Date.now() + EGRESS_CACHE_TTL_MS,
  });
}

export function getCachedConnectionEgress(connectionId) {
  if (!connectionId) return null;
  const entry = egressCache.get(connectionId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    egressCache.delete(connectionId);
    return null;
  }
  return entry.proxyOptions;
}

export function invalidateConnectionEgress(connectionId) {
  if (connectionId) {
    bumpConnectionEgressGeneration(connectionId);
    egressCache.delete(connectionId);
  }
}

export function invalidateEgressByPool(poolId) {
  if (!poolId) return;
  for (const [connectionId, entry] of egressCache.entries()) {
    if (entry.proxyOptions?.connectionProxyPoolId === poolId) {
      bumpConnectionEgressGeneration(connectionId);
      egressCache.delete(connectionId);
    }
  }
}

/** Test-only reset for egress generation state. */
export function resetEgressGenerationsForTests() {
  egressCache.clear();
  connectionEgressGenerations.clear();
  nextEgressGeneration = 1;
}

/** Sanitized network snapshot for request details / logs (no secrets). */
export function buildNetworkMetaFromProxyOptions(proxyOptions, { workerId } = {}) {
  if (proxyOptions?.vercelRelayUrl) {
    return {
      engine: "go",
      egressMode: "relay",
      proxyUsed: true,
      proxyLabel: redactProxyUrlForLog(proxyOptions.vercelRelayUrl),
      workerId: workerId || null,
    };
  }
  if (proxyOptions?.connectionProxyEnabled && proxyOptions?.connectionProxyUrl) {
    return {
      engine: "go",
      egressMode: "proxy",
      proxyUsed: true,
      proxyLabel: redactProxyUrlForLog(proxyOptions.connectionProxyUrl),
      workerId: workerId || null,
    };
  }
  return {
    engine: "go",
    egressMode: "direct",
    proxyUsed: false,
    proxyLabel: null,
    workerId: workerId || null,
  };
}

export function redactProxyUrlForLog(proxyUrl) {
  const raw = normalizeString(proxyUrl);
  if (!raw) return "";
  try {
    const parsed = new URL(raw.includes("://") ? raw : `http://${raw}`);
    const auth = parsed.username ? `${parsed.username}:***@` : "";
    const port = parsed.port ? `:${parsed.port}` : "";
    return `${parsed.protocol}//${auth}${parsed.hostname}${port}`;
  } catch {
    return raw.slice(0, 24) + (raw.length > 24 ? "…" : "");
  }
}

/**
 * Debug log for connection egress assignment (no secrets).
 * @param {"assigned"|"existing"|"failover"|"direct"} affinity
 */
export function logEgressAssignment(log, { connectionId, provider, proxyOptions, affinity = "existing", reason = "" } = {}) {
  if (!log?.debug && !log?.info) return;
  const poolId = proxyOptions?.connectionProxyPoolId || "none";
  const proxy =
    proxyOptions?.vercelRelayUrl
      ? redactProxyUrlForLog(proxyOptions.vercelRelayUrl)
      : proxyOptions?.connectionProxyEnabled
        ? redactProxyUrlForLog(proxyOptions.connectionProxyUrl)
        : "direct";
  const msg = `[EGRESS] connection=${connectionId || "?"} provider=${provider || "?"} pool=${poolId} proxy=${proxy} affinity=${affinity}${reason ? ` reason=${reason}` : ""}`;
  if (log.debug) log.debug("EGRESS", msg);
  else log.info("EGRESS", msg);
}

/** Resolve proxyOptions for OAuth login before a connection row exists. */
export async function resolveOAuthProxyOptions(proxyPoolId) {
  if (!proxyPoolId || proxyPoolId === "__none__") {
    return buildProxyOptions({});
  }
  const resolved = await resolveConnectionProxyConfig({ proxyPoolId });
  return buildProxyOptions({
    connectionProxyEnabled: resolved.connectionProxyEnabled,
    connectionProxyUrl: resolved.connectionProxyUrl,
    connectionNoProxy: resolved.connectionNoProxy,
    vercelRelayUrl: resolved.vercelRelayUrl,
    strictProxy: resolved.strictProxy,
    connectionProxyPoolId: resolved.proxyPoolId || proxyPoolId,
  });
}

/** Attach proxyPoolId to token payload for createProviderConnection. */
export function attachOAuthProxyPoolId(tokenData, proxyPoolId) {
  if (!proxyPoolId || proxyPoolId === "__none__") return tokenData;
  return {
    ...tokenData,
    providerSpecificData: {
      ...(tokenData?.providerSpecificData || {}),
      proxyPoolId,
    },
  };
}

/** Resolve live proxy pool config and build canonical proxyOptions for a connection row. */
export async function buildProxyOptionsForConnection(connection) {
  const psd = connection?.providerSpecificData || {};
  const resolved = await resolveConnectionProxyConfig(psd);
  return buildProxyOptions({
    connectionProxyEnabled: resolved.connectionProxyEnabled,
    connectionProxyUrl: resolved.connectionProxyUrl,
    connectionNoProxy: resolved.connectionNoProxy,
    vercelRelayUrl: resolved.vercelRelayUrl,
    strictProxy: resolved.strictProxy,
    connectionProxyPoolId: resolved.proxyPoolId || psd.proxyPoolId,
  });
}
