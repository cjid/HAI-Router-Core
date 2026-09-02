import { EventEmitter } from "events";
import { getRuntimeGlobalStore } from "@/shared/utils/runtimeGlobals.js";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { getMeta, setMeta } from "../helpers/metaStore.js";
import { PROVIDERS } from "open-sse/providers/index.js";
import { countActiveProviders } from "./providerStatesRepo.js";
import { buildHeatmapGrid } from "@/shared/utils/usageHeatmap.js";

function maskApiKey(key) {
  if (!key || typeof key !== "string") return null;
  if (key.length <= 8) return key.charAt(0) + "***";
  return key.slice(0, 8) + "***";
}

const PENDING_TIMEOUT_MS = 60 * 1000;
const RING_CAP = 50;
const CONN_CACHE_TTL_MS = 30 * 1000;
const PERIOD_MS = { "24h": 86400000, "7d": 604800000, "30d": 2592000000, "60d": 5184000000 };

// In-memory state — globalThis so chat routes + usage SSE share one store (Turbopack-safe)
const USAGE_STORE = getRuntimeGlobalStore("usageStore");
if (!USAGE_STORE.pendingRequests) {
  USAGE_STORE.pendingRequests = global._pendingRequests || { byModel: {}, byAccount: {} };
}
if (!USAGE_STORE.lastErrorProvider) {
  USAGE_STORE.lastErrorProvider = global._lastErrorProvider || { provider: "", ts: 0 };
}
if (!USAGE_STORE.statsEmitter) {
  USAGE_STORE.statsEmitter = global._statsEmitter || new EventEmitter();
  USAGE_STORE.statsEmitter.setMaxListeners(50);
}
if (!USAGE_STORE.pendingTimers) USAGE_STORE.pendingTimers = global._pendingTimers || {};
if (!USAGE_STORE.recentRing) USAGE_STORE.recentRing = global._recentRing || { items: [], initialized: false };
if (!USAGE_STORE.connectionMapCache) USAGE_STORE.connectionMapCache = global._connectionMapCache || { map: {}, ts: 0 };
if (!USAGE_STORE.statsEmitTimers) USAGE_STORE.statsEmitTimers = global._statsEmitTimers || { pending: null, update: null };

// Legacy aliases (tests / older code)
global._pendingRequests = USAGE_STORE.pendingRequests;
global._lastErrorProvider = USAGE_STORE.lastErrorProvider;
global._statsEmitter = USAGE_STORE.statsEmitter;
global._pendingTimers = USAGE_STORE.pendingTimers;
global._recentRing = USAGE_STORE.recentRing;
global._connectionMapCache = USAGE_STORE.connectionMapCache;
global._statsEmitTimers = USAGE_STORE.statsEmitTimers;

const pendingRequests = USAGE_STORE.pendingRequests;
const lastErrorProvider = USAGE_STORE.lastErrorProvider;
const pendingTimers = USAGE_STORE.pendingTimers;
const recentRing = USAGE_STORE.recentRing;
const connCache = USAGE_STORE.connectionMapCache;
const statsEmitTimers = USAGE_STORE.statsEmitTimers;

export const statsEmitter = USAGE_STORE.statsEmitter;

function scheduleStatsEvent(event, delayMs = 150) {
  const key = event === "update" ? "update" : "pending";
  if (statsEmitTimers[key]) clearTimeout(statsEmitTimers[key]);
  statsEmitTimers[key] = setTimeout(() => {
    statsEmitTimers[key] = null;
    statsEmitter.emit(event);
  }, delayMs);
  statsEmitTimers[key]?.unref?.();
}

/** Immediate SSE/topology refresh (exported for streaming chunk heartbeats). */
export function emitPendingStatsNow() {
  if (statsEmitTimers.pending) clearTimeout(statsEmitTimers.pending);
  statsEmitTimers.pending = null;
  statsEmitter.emit("pending");
}

function resolvePendingConnectionId(provider, connectionId) {
  if (connectionId) return connectionId;
  if (provider && PROVIDERS[provider]?.noAuth) return "noauth";
  return null;
}

function snapshotPendingRequests() {
  return {
    byModel: { ...pendingRequests.byModel },
    byAccount: Object.fromEntries(
      Object.entries(pendingRequests.byAccount).map(([id, models]) => [id, { ...models }])
    ),
  };
}

function getLocalDateKey(timestamp) {
  const d = timestamp ? new Date(timestamp) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addToCounter(target, key, values) {
  if (!target[key]) target[key] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 };
  target[key].requests += values.requests || 1;
  target[key].promptTokens += values.promptTokens || 0;
  target[key].completionTokens += values.completionTokens || 0;
  target[key].cachedTokens += values.cachedTokens || 0;
  target[key].cost += values.cost || 0;
  if (values.meta) Object.assign(target[key], values.meta);
}

function aggregateEntryToDay(day, entry) {
  const promptTokens = entry.tokens?.prompt_tokens || entry.tokens?.input_tokens || 0;
  const completionTokens = entry.tokens?.completion_tokens || entry.tokens?.output_tokens || 0;
  const cachedTokens = entry.tokens?.cached_tokens || entry.tokens?.cache_read_input_tokens || 0;
  const cost = entry.cost || 0;
  const vals = { promptTokens, completionTokens, cachedTokens, cost };

  day.requests = (day.requests || 0) + 1;
  day.promptTokens = (day.promptTokens || 0) + promptTokens;
  day.completionTokens = (day.completionTokens || 0) + completionTokens;
  day.cachedTokens = (day.cachedTokens || 0) + cachedTokens;
  day.cost = (day.cost || 0) + cost;

  day.byProvider ||= {};
  day.byModel ||= {};
  day.byAccount ||= {};
  day.byApiKey ||= {};
  day.byEndpoint ||= {};

  if (entry.provider) addToCounter(day.byProvider, entry.provider, vals);

  const modelKey = entry.provider ? `${entry.model}|${entry.provider}` : entry.model;
  addToCounter(day.byModel, modelKey, { ...vals, meta: { rawModel: entry.model, provider: entry.provider } });

  if (entry.connectionId) {
    addToCounter(day.byAccount, entry.connectionId, { ...vals, meta: { rawModel: entry.model, provider: entry.provider } });
  }

  const apiKeyVal = entry.apiKey && typeof entry.apiKey === "string" ? entry.apiKey : "local-no-key";
  const akModelKey = `${apiKeyVal}|${entry.model}|${entry.provider || "unknown"}`;
  addToCounter(day.byApiKey, akModelKey, { ...vals, meta: { rawModel: entry.model, provider: entry.provider, apiKey: entry.apiKey || null } });

  const endpoint = entry.endpoint || "Unknown";
  const epKey = `${endpoint}|${entry.model}|${entry.provider || "unknown"}`;
  addToCounter(day.byEndpoint, epKey, { ...vals, meta: { endpoint, rawModel: entry.model, provider: entry.provider } });
}

function shouldIncludeRecentRequest(entry) {
  if (entry.requestKind === "model_test") return true;
  const hasTokens = (entry.promptTokens ?? 0) > 0 || (entry.completionTokens ?? 0) > 0;
  if (hasTokens) return true;
  return entry.status === "partial"
    || entry.usageStatus === "partial"
    || entry.usageStatus === "estimated"
    || Boolean(entry.terminationReason);
}

function recentRequestDedupeKey(entry) {
  if (entry.requestKind === "model_test") {
    return `${entry.timestamp}|${entry.model}|${entry.provider}|model_test`;
  }
  const minute = entry.timestamp ? entry.timestamp.slice(0, 16) : "";
  return `${entry.model}|${entry.provider}|${entry.promptTokens}|${entry.completionTokens}|${entry.terminationReason || ""}|${minute}`;
}

export { shouldIncludeRecentRequest, recentRequestDedupeKey };

function pushToRing(entry) {
  recentRing.items.push(entry);
  if (recentRing.items.length > RING_CAP) {
    recentRing.items = recentRing.items.slice(-RING_CAP);
  }
}

/** Replace a placeholder ring entry (same timestamp/model/provider) or append. */
function upsertRingEntry(entry) {
  const idx = recentRing.items.findIndex((e) =>
    e.timestamp === entry.timestamp
    && e.model === entry.model
    && (e.provider || "") === (entry.provider || "")
  );
  if (idx >= 0) recentRing.items[idx] = entry;
  else pushToRing(entry);
}

async function getConnectionMapCached() {
  if (Date.now() - connCache.ts < CONN_CACHE_TTL_MS) return connCache.map;
  try {
    const { getProviderConnections } = await import("./connectionsRepo.js");
    const all = await getProviderConnections();
    const map = {};
    for (const c of all) map[c.id] = c.name || c.email || c.id;
    connCache.map = map;
    connCache.ts = Date.now();
  } catch {}
  return connCache.map;
}

async function ensureRingInitialized() {
  if (recentRing.initialized) return;
  recentRing.initialized = true;
  try {
    const db = await getAdapter();
    const rows = db.all(`SELECT timestamp, provider, model, connectionId, apiKey, endpoint, cost, status, tokens, meta FROM usageHistory ORDER BY id DESC LIMIT ?`, [RING_CAP]);
    recentRing.items = rows.reverse().map((r) => ({
      timestamp: r.timestamp, provider: r.provider, model: r.model, connectionId: r.connectionId,
      apiKey: r.apiKey, endpoint: r.endpoint, cost: r.cost, status: r.status,
      tokens: parseJson(r.tokens, {}),
      usageMeta: parseJson(r.meta, {}),
    }));
  } catch {}
}

async function calculateCost(provider, model, tokens) {
  if (!tokens || !provider || !model) return 0;
  try {
    const { getPricingForModel } = await import("./pricingRepo.js");
    const pricing = await getPricingForModel(provider, model);
    if (!pricing) return 0;

    // Delegate the actual math to the single source of truth (avoids the two
    // copies drifting apart — see open-sse/providers/pricing.js for the
    // cache-inclusive prompt_tokens convention this assumes).
    const { calculateCostFromTokens } = await import("open-sse/providers/pricing.js");
    return calculateCostFromTokens(tokens, pricing);
  } catch (e) {
    console.error("Error calculating cost:", e);
    return 0;
  }
}

export function trackPendingRequest(model, provider, connectionId, started, error = false, pendingToken = null) {
  const effectiveConnectionId = resolvePendingConnectionId(provider, connectionId);
  const modelKey = provider ? `${model} (${provider})` : model;

  if (!pendingRequests.byModel[modelKey]) pendingRequests.byModel[modelKey] = 0;
  pendingRequests.byModel[modelKey] = Math.max(0, pendingRequests.byModel[modelKey] + (started ? 1 : -1));
  if (pendingRequests.byModel[modelKey] === 0) delete pendingRequests.byModel[modelKey];

  if (effectiveConnectionId) {
    if (!pendingRequests.byAccount[effectiveConnectionId]) pendingRequests.byAccount[effectiveConnectionId] = {};
    if (!pendingRequests.byAccount[effectiveConnectionId][modelKey]) pendingRequests.byAccount[effectiveConnectionId][modelKey] = 0;
    pendingRequests.byAccount[effectiveConnectionId][modelKey] = Math.max(0, pendingRequests.byAccount[effectiveConnectionId][modelKey] + (started ? 1 : -1));
    if (pendingRequests.byAccount[effectiveConnectionId][modelKey] === 0) {
      delete pendingRequests.byAccount[effectiveConnectionId][modelKey];
      if (Object.keys(pendingRequests.byAccount[effectiveConnectionId]).length === 0) {
        delete pendingRequests.byAccount[effectiveConnectionId];
      }
    }
  }

  if (started) {
    const token = pendingToken || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    clearTimeout(pendingTimers[token]);
    pendingTimers[token] = setTimeout(() => {
      delete pendingTimers[token];
      if (pendingRequests.byModel[modelKey] > 0) {
        pendingRequests.byModel[modelKey]--;
        if (pendingRequests.byModel[modelKey] === 0) delete pendingRequests.byModel[modelKey];
      }
      if (effectiveConnectionId && pendingRequests.byAccount[effectiveConnectionId]?.[modelKey] > 0) {
        pendingRequests.byAccount[effectiveConnectionId][modelKey]--;
        if (pendingRequests.byAccount[effectiveConnectionId][modelKey] === 0) {
          delete pendingRequests.byAccount[effectiveConnectionId][modelKey];
          if (Object.keys(pendingRequests.byAccount[effectiveConnectionId]).length === 0) {
            delete pendingRequests.byAccount[effectiveConnectionId];
          }
        }
      }
      scheduleStatsEvent("pending");
    }, PENDING_TIMEOUT_MS);
    emitPendingStatsNow();
    scheduleStatsEvent("pending");
    return token;
  }

  if (pendingToken) {
    clearTimeout(pendingTimers[pendingToken]);
    delete pendingTimers[pendingToken];
  }

  if (!started && error && provider) {
    lastErrorProvider.provider = provider.toLowerCase();
    lastErrorProvider.ts = Date.now();
  }

  scheduleStatsEvent("pending");
}

/** Test/diagnostic helper — pending counters and orphan timer count. */
export function getPendingLifecycleSnapshot() {
  const totalPending = Object.values(pendingRequests.byModel).reduce((s, n) => s + n, 0);
  return {
    byModel: { ...pendingRequests.byModel },
    byAccount: JSON.parse(JSON.stringify(pendingRequests.byAccount)),
    timerCount: Object.keys(pendingTimers).length,
    totalPending,
  };
}

function parsePendingModelKey(modelKey) {
  const match = modelKey.match(/^(.*) \((.*)\)$/);
  return {
    model: match ? match[1] : modelKey,
    provider: match ? match[2] : "unknown",
  };
}

function accountLabelForPending(connectionId, connectionMap) {
  if (!connectionId || connectionId === "noauth") return "Public";
  return connectionMap[connectionId] || `Account ${connectionId.slice(0, 8)}...`;
}

/** Pending counts for topology/SSE — includes no-auth providers (byModel-only tracking). */
function collectActiveRequestsFromPending(connectionMap = {}) {
  const activeRequests = [];
  const seen = new Set();

  for (const [connectionId, models] of Object.entries(pendingRequests.byAccount)) {
    for (const [modelKey, count] of Object.entries(models)) {
      if (count <= 0) continue;
      const { model, provider } = parsePendingModelKey(modelKey);
      const dedupeKey = `${provider.toLowerCase()}|${model}`;
      seen.add(dedupeKey);
      activeRequests.push({
        model,
        provider,
        account: accountLabelForPending(connectionId, connectionMap),
        count,
      });
    }
  }

  for (const [modelKey, count] of Object.entries(pendingRequests.byModel)) {
    if (count <= 0) continue;
    const { model, provider } = parsePendingModelKey(modelKey);
    const dedupeKey = `${provider.toLowerCase()}|${model}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    activeRequests.push({
      model,
      provider,
      account: "Public",
      count,
    });
  }

  return activeRequests;
}

export async function getActiveRequests() {
  const connectionMap = await getConnectionMapCached();
  const activeRequests = collectActiveRequestsFromPending(connectionMap);

  await ensureRingInitialized();
  const seen = new Set();
  const recentRequests = [...recentRing.items]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .map((e) => {
      const t = e.tokens || {};
      const meta = typeof e.usageMeta === "object" ? e.usageMeta : (e.turnType ? { turnType: e.turnType } : {});
      return {
        timestamp: e.timestamp, model: e.model, provider: e.provider || "",
        promptTokens: t.prompt_tokens || t.input_tokens || 0,
        completionTokens: t.completion_tokens || t.output_tokens || 0,
        status: e.status || "ok",
        turnType: meta.turnType || e.turnType || null,
        requestKind: meta.requestKind || null,
        connectionId: e.connectionId || null,
        usageStatus: meta.usageStatus || null,
        usageSource: meta.usageSource || null,
        terminationReason: meta.terminationReason || null,
        usageEstimated: meta.usageEstimated || meta.usageSource === "tokenizer" || false,
      };
    })
    .filter((e) => {
      if (!shouldIncludeRecentRequest(e)) return false;
      const key = recentRequestDedupeKey(e);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);

  const errorProvider = (Date.now() - lastErrorProvider.ts < 10000) ? lastErrorProvider.provider : "";
  return { activeRequests, recentRequests, errorProvider, pending: snapshotPendingRequests() };
}

export async function saveRequestUsage(entry) {
  try {
    const db = await getAdapter();

    if (!entry.timestamp) entry.timestamp = new Date().toISOString();
    entry.cost = await calculateCost(entry.provider, entry.model, entry.tokens);

    const tokens = entry.tokens || {};
    const promptTokens = tokens.prompt_tokens || tokens.input_tokens || 0;
    const completionTokens = tokens.completion_tokens || tokens.output_tokens || 0;

    let inserted = false;

    // All 3 writes (history insert, daily upsert, lifetime counter) in ONE transaction.
    // better-sqlite3 is sync → no JS yield mid-transaction → no race in same process.
    db.transaction(() => {
      const isPartialUpdate = entry.status === "partial"
        || entry.usageMeta?.usageStatus === "partial"
        || entry.usageMeta?.usageStatus === "estimated";

      const existing = isPartialUpdate ? db.get(
        `SELECT id, endpoint FROM usageHistory
         WHERE timestamp = ?
           AND COALESCE(provider, '') = COALESCE(?, '')
           AND COALESCE(model, '') = COALESCE(?, '')
           AND COALESCE(connectionId, '') = COALESCE(?, '')
           AND COALESCE(apiKey, '') = COALESCE(?, '')
           AND promptTokens = ?
           AND completionTokens = ?
         ORDER BY id DESC LIMIT 1`,
        [
          entry.timestamp, entry.provider || null, entry.model || null,
          entry.connectionId || null, entry.apiKey || null,
          promptTokens, completionTokens,
        ]
      ) : null;

      if (existing) {
        const newMeta = entry.usageMeta || (entry.turnType ? { turnType: entry.turnType } : {});
        const newHasTokens = promptTokens > 0 || completionTokens > 0;
        const newIsPartial = entry.status === "partial" || newMeta.usageStatus === "partial" || newMeta.usageStatus === "estimated";
        if (newHasTokens || newIsPartial) {
          db.run(
            `UPDATE usageHistory SET promptTokens = ?, completionTokens = ?, cost = ?, status = ?, tokens = ?, meta = ? WHERE id = ?`,
            [
              promptTokens, completionTokens, entry.cost || 0, entry.status || "ok",
              stringifyJson(tokens), stringifyJson(newMeta), existing.id,
            ]
          );
          inserted = true;
        } else if (!existing.endpoint && entry.endpoint) {
          db.run(`UPDATE usageHistory SET endpoint = ? WHERE id = ?`, [entry.endpoint, existing.id]);
        }
        return;
      }

      db.run(
        `INSERT INTO usageHistory(timestamp, provider, model, connectionId, apiKey, endpoint, promptTokens, completionTokens, cost, status, tokens, meta) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.timestamp, entry.provider || null, entry.model || null,
          entry.connectionId || null, entry.apiKey || null, entry.endpoint || null,
          promptTokens, completionTokens, entry.cost || 0, entry.status || "ok",
          stringifyJson(tokens), stringifyJson(entry.usageMeta || (entry.turnType ? { turnType: entry.turnType } : {})),
        ]
      );

      const dateKey = getLocalDateKey(entry.timestamp);
      const row = db.get(`SELECT data FROM usageDaily WHERE dateKey = ?`, [dateKey]);
      const day = row ? parseJson(row.data, {}) : {
        requests: 0, promptTokens: 0, completionTokens: 0, cost: 0,
        byProvider: {}, byModel: {}, byAccount: {}, byApiKey: {}, byEndpoint: {},
      };
      aggregateEntryToDay(day, entry);
      db.run(`INSERT INTO usageDaily(dateKey, data) VALUES(?, ?) ON CONFLICT(dateKey) DO UPDATE SET data = excluded.data`, [dateKey, stringifyJson(day)]);

      // Atomic counter increment in same transaction
      const cur = db.get(`SELECT value FROM _meta WHERE key = 'totalRequestsLifetime'`);
      const next = (cur ? parseInt(cur.value, 10) : 0) + 1;
      db.run(`INSERT INTO _meta(key, value) VALUES('totalRequestsLifetime', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(next)]);
      inserted = true;
    });

    if (inserted) {
      upsertRingEntry(entry);
      scheduleStatsEvent("update", 250);
    }
  } catch (e) {
    console.error("Failed to save usage stats:", e);
  }
}

export async function getUsageHistory(filter = {}) {
  const db = await getAdapter();
  const conds = [];
  const params = [];

  if (filter.provider) { conds.push("provider = ?"); params.push(filter.provider); }
  if (filter.model) { conds.push("model = ?"); params.push(filter.model); }
  if (filter.startDate) { conds.push("timestamp >= ?"); params.push(new Date(filter.startDate).toISOString()); }
  if (filter.endDate) { conds.push("timestamp <= ?"); params.push(new Date(filter.endDate).toISOString()); }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = db.all(`SELECT timestamp, provider, model, connectionId, apiKey, endpoint, cost, status, tokens FROM usageHistory ${where} ORDER BY id ASC`, params);

  return rows.map((r) => ({
    timestamp: r.timestamp, provider: r.provider, model: r.model,
    connectionId: r.connectionId, apiKeyMasked: maskApiKey(r.apiKey), endpoint: r.endpoint,
    cost: r.cost, status: r.status, tokens: parseJson(r.tokens, {}),
  }));
}

function loadDaysInRange(adapter, maxDays) {
  if (maxDays == null) {
    return adapter.all(`SELECT dateKey, data FROM usageDaily`);
  }
  const today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - maxDays + 1);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  return adapter.all(`SELECT dateKey, data FROM usageDaily WHERE dateKey >= ?`, [cutoffKey]);
}

export async function getUsageStats(period = "all") {
  const db = await getAdapter();

  const [{ getProviderConnections }, { getApiKeys }, { getProviderNodes }] = await Promise.all([
    import("./connectionsRepo.js"),
    import("./apiKeysRepo.js"),
    import("./nodesRepo.js"),
  ]);

  let allConnections = [];
  try { allConnections = await getProviderConnections(); } catch {}
  const connectionMap = {};
  for (const c of allConnections) connectionMap[c.id] = c.name || c.email || c.id;

  const providerNodeNameMap = {};
  try {
    const nodes = await getProviderNodes();
    for (const n of nodes) if (n.id && n.name) providerNodeNameMap[n.id] = n.name;
  } catch {}

  let allApiKeys = [];
  try { allApiKeys = await getApiKeys(); } catch {}
  const apiKeyMap = {};
  for (const k of allApiKeys) apiKeyMap[k.key] = { name: k.name, id: k.id, createdAt: k.createdAt };

  // recentRequests from live history (last 100 entries enough for 20 deduped)
  const recentRows = db.all(`SELECT timestamp, provider, model, connectionId, tokens, status, meta FROM usageHistory ORDER BY id DESC LIMIT 100`);
  const seen = new Set();
  const recentRequests = recentRows
    .map((r) => {
      const t = parseJson(r.tokens, {}) || {};
      const meta = parseJson(r.meta, {}) || {};
      return {
        timestamp: r.timestamp, model: r.model, provider: r.provider || "",
        connectionId: r.connectionId || null,
        promptTokens: t.prompt_tokens || t.input_tokens || 0,
        completionTokens: t.completion_tokens || t.output_tokens || 0,
        cachedTokens: t.cached_tokens || t.cache_read_input_tokens || 0,
        status: r.status || "ok",
        turnType: meta.turnType || null,
        requestKind: meta.requestKind || null,
        usageStatus: meta.usageStatus || null,
        usageSource: meta.usageSource || null,
        terminationReason: meta.terminationReason || null,
        usageEstimated: meta.usageEstimated || meta.usageSource === "tokenizer" || false,
      };
    })
    .filter((e) => {
      if (!shouldIncludeRecentRequest(e)) return false;
      const key = recentRequestDedupeKey(e);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);

  const stats = {
    totalRequests: 0,
    totalPromptTokens: 0, totalCompletionTokens: 0, totalCachedTokens: 0, totalCost: 0,
    byProvider: {}, byModel: {}, byAccount: {}, byApiKey: {}, byEndpoint: {},
    last10Minutes: [],
    pending: pendingRequests,
    activeRequests: [],
    recentRequests,
    errorProvider: (Date.now() - lastErrorProvider.ts < 10000) ? lastErrorProvider.provider : "",
  };

  // Active requests (in-flight) — includes no-auth free providers
  stats.activeRequests = collectActiveRequestsFromPending(connectionMap);

  // last10Minutes — query 10min window
  const now = new Date();
  const currentMinuteStart = new Date(Math.floor(now.getTime() / 60000) * 60000);
  const tenMinutesAgo = new Date(currentMinuteStart.getTime() - 9 * 60 * 1000);
  const bucketMap = {};
  for (let i = 0; i < 10; i++) {
    const ts = currentMinuteStart.getTime() - (9 - i) * 60 * 1000;
    bucketMap[ts] = { requests: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
    stats.last10Minutes.push(bucketMap[ts]);
  }
  const recent10 = db.all(
    `SELECT timestamp, promptTokens, completionTokens, cost FROM usageHistory WHERE timestamp >= ? AND timestamp <= ?`,
    [tenMinutesAgo.toISOString(), now.toISOString()]
  );
  for (const r of recent10) {
    const tt = new Date(r.timestamp).getTime();
    const minuteStart = Math.floor(tt / 60000) * 60000;
    if (bucketMap[minuteStart]) {
      bucketMap[minuteStart].requests++;
      bucketMap[minuteStart].promptTokens += r.promptTokens || 0;
      bucketMap[minuteStart].completionTokens += r.completionTokens || 0;
      bucketMap[minuteStart].cost += r.cost || 0;
    }
  }

  const useDailySummary = period !== "24h" && period !== "today";

  if (useDailySummary) {
    const periodDays = { "7d": 7, "30d": 30, "60d": 60 };
    const maxDays = periodDays[period] || null;
    const dayRows = loadDaysInRange(db, maxDays);

    for (const dr of dayRows) {
      const dateKey = dr.dateKey;
      const day = parseJson(dr.data, {});
      stats.totalPromptTokens += day.promptTokens || 0;
      stats.totalCompletionTokens += day.completionTokens || 0;
      stats.totalCachedTokens += day.cachedTokens || 0;
      stats.totalCost += day.cost || 0;

      for (const [prov, p] of Object.entries(day.byProvider || {})) {
        if (!stats.byProvider[prov]) stats.byProvider[prov] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 };
        stats.byProvider[prov].requests += p.requests || 0;
        stats.byProvider[prov].promptTokens += p.promptTokens || 0;
        stats.byProvider[prov].completionTokens += p.completionTokens || 0;
        stats.byProvider[prov].cachedTokens += p.cachedTokens || 0;
        stats.byProvider[prov].cost += p.cost || 0;
      }

      for (const [mk, m] of Object.entries(day.byModel || {})) {
        const rawModel = m.rawModel || mk.split("|")[0];
        const provider = m.provider || mk.split("|")[1] || "";
        const statsKey = provider ? `${rawModel} (${provider})` : rawModel;
        const providerDisplayName = providerNodeNameMap[provider] || provider;
        if (!stats.byModel[statsKey]) {
          stats.byModel[statsKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel, provider: providerDisplayName, lastUsed: dateKey };
        }
        stats.byModel[statsKey].requests += m.requests || 0;
        stats.byModel[statsKey].promptTokens += m.promptTokens || 0;
        stats.byModel[statsKey].completionTokens += m.completionTokens || 0;
        stats.byModel[statsKey].cachedTokens += m.cachedTokens || 0;
        stats.byModel[statsKey].cost += m.cost || 0;
        if (dateKey > (stats.byModel[statsKey].lastUsed || "")) stats.byModel[statsKey].lastUsed = dateKey;
      }

      for (const [connId, a] of Object.entries(day.byAccount || {})) {
        const accountName = connectionMap[connId] || `Account ${connId.slice(0, 8)}...`;
        const rawModel = a.rawModel || "";
        const provider = a.provider || "";
        const providerDisplayName = providerNodeNameMap[provider] || provider;
        const accountKey = `${rawModel} (${provider} - ${accountName})`;
        if (!stats.byAccount[accountKey]) {
          stats.byAccount[accountKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel, provider: providerDisplayName, connectionId: connId, accountName, lastUsed: dateKey };
        }
        stats.byAccount[accountKey].requests += a.requests || 0;
        stats.byAccount[accountKey].promptTokens += a.promptTokens || 0;
        stats.byAccount[accountKey].completionTokens += a.completionTokens || 0;
        stats.byAccount[accountKey].cachedTokens += a.cachedTokens || 0;
        stats.byAccount[accountKey].cost += a.cost || 0;
        if (dateKey > (stats.byAccount[accountKey].lastUsed || "")) stats.byAccount[accountKey].lastUsed = dateKey;
      }

      for (const [akKey, ak] of Object.entries(day.byApiKey || {})) {
        const rawModel = ak.rawModel || "";
        const provider = ak.provider || "";
        const providerDisplayName = providerNodeNameMap[provider] || provider;
        const apiKeyVal = ak.apiKey;
        const keyInfo = apiKeyVal ? apiKeyMap[apiKeyVal] : null;
        const keyName = keyInfo?.name || (apiKeyVal ? apiKeyVal.slice(0, 8) + "..." : "Local (No API Key)");
        const apiKeyMasked = maskApiKey(apiKeyVal);
        const apiKeyKey = apiKeyMasked || "local-no-key";
        if (!stats.byApiKey[akKey]) {
          stats.byApiKey[akKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel, provider: providerDisplayName, apiKeyMasked, keyName, apiKeyKey, lastUsed: dateKey };
        }
        stats.byApiKey[akKey].requests += ak.requests || 0;
        stats.byApiKey[akKey].promptTokens += ak.promptTokens || 0;
        stats.byApiKey[akKey].completionTokens += ak.completionTokens || 0;
        stats.byApiKey[akKey].cachedTokens += ak.cachedTokens || 0;
        stats.byApiKey[akKey].cost += ak.cost || 0;
        if (dateKey > (stats.byApiKey[akKey].lastUsed || "")) stats.byApiKey[akKey].lastUsed = dateKey;
      }

      for (const [epKey, ep] of Object.entries(day.byEndpoint || {})) {
        const endpoint = ep.endpoint || epKey.split("|")[0] || "Unknown";
        const rawModel = ep.rawModel || "";
        const provider = ep.provider || "";
        const providerDisplayName = providerNodeNameMap[provider] || provider;
        if (!stats.byEndpoint[epKey]) {
          stats.byEndpoint[epKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, endpoint, rawModel, provider: providerDisplayName, lastUsed: dateKey };
        }
        stats.byEndpoint[epKey].requests += ep.requests || 0;
        stats.byEndpoint[epKey].promptTokens += ep.promptTokens || 0;
        stats.byEndpoint[epKey].completionTokens += ep.completionTokens || 0;
        stats.byEndpoint[epKey].cachedTokens += ep.cachedTokens || 0;
        stats.byEndpoint[epKey].cost += ep.cost || 0;
        if (dateKey > (stats.byEndpoint[epKey].lastUsed || "")) stats.byEndpoint[epKey].lastUsed = dateKey;
      }
    }

    // Overlay precise lastUsed timestamps from history
    const overlayCutoff = maxDays ? Date.now() - maxDays * 86400000 : 0;
    const histRows = db.all(
      `SELECT timestamp, provider, model, connectionId, apiKey, endpoint FROM usageHistory WHERE timestamp >= ?`,
      [new Date(overlayCutoff).toISOString()]
    );
    for (const e of histRows) {
      const ts = e.timestamp;
      const modelKey = e.provider ? `${e.model} (${e.provider})` : e.model;
      if (stats.byModel[modelKey] && new Date(ts) > new Date(stats.byModel[modelKey].lastUsed)) stats.byModel[modelKey].lastUsed = ts;

      if (e.connectionId) {
        const accountName = connectionMap[e.connectionId] || `Account ${e.connectionId.slice(0, 8)}...`;
        const accountKey = `${e.model} (${e.provider} - ${accountName})`;
        if (stats.byAccount[accountKey] && new Date(ts) > new Date(stats.byAccount[accountKey].lastUsed)) stats.byAccount[accountKey].lastUsed = ts;
      }

      const apiKeyKey = (e.apiKey && typeof e.apiKey === "string")
        ? `${e.apiKey}|${e.model}|${e.provider || "unknown"}`
        : "local-no-key";
      if (stats.byApiKey[apiKeyKey] && new Date(ts) > new Date(stats.byApiKey[apiKeyKey].lastUsed)) stats.byApiKey[apiKeyKey].lastUsed = ts;

      const endpoint = e.endpoint || "Unknown";
      const endpointKey = `${endpoint}|${e.model}|${e.provider || "unknown"}`;
      if (stats.byEndpoint[endpointKey] && new Date(ts) > new Date(stats.byEndpoint[endpointKey].lastUsed)) stats.byEndpoint[endpointKey].lastUsed = ts;
    }
  } else {
    // 24h / today: live history
    let cutoff;
    if (period === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      cutoff = startOfDay.toISOString();
    } else {
      cutoff = new Date(Date.now() - PERIOD_MS["24h"]).toISOString();
    }
    const filtered = db.all(
      `SELECT timestamp, provider, model, connectionId, apiKey, endpoint, promptTokens, completionTokens, cost, tokens FROM usageHistory WHERE timestamp >= ?`,
      [cutoff]
    );

    for (const r of filtered) {
      const tokens = parseJson(r.tokens, {}) || {};
      const promptTokens = tokens.prompt_tokens || 0;
      const completionTokens = tokens.completion_tokens || 0;
      const cachedTokens = tokens.cached_tokens || tokens.cache_read_input_tokens || 0;
      const entryCost = r.cost || 0;
      const providerDisplayName = providerNodeNameMap[r.provider] || r.provider;

      stats.totalPromptTokens += promptTokens;
      stats.totalCompletionTokens += completionTokens;
      stats.totalCachedTokens += cachedTokens;
      stats.totalCost += entryCost;

      if (!stats.byProvider[r.provider]) stats.byProvider[r.provider] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 };
      stats.byProvider[r.provider].requests++;
      stats.byProvider[r.provider].promptTokens += promptTokens;
      stats.byProvider[r.provider].completionTokens += completionTokens;
      stats.byProvider[r.provider].cachedTokens += cachedTokens;
      stats.byProvider[r.provider].cost += entryCost;

      const modelKey = r.provider ? `${r.model} (${r.provider})` : r.model;
      if (!stats.byModel[modelKey]) {
        stats.byModel[modelKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, lastUsed: r.timestamp };
      }
      stats.byModel[modelKey].requests++;
      stats.byModel[modelKey].promptTokens += promptTokens;
      stats.byModel[modelKey].completionTokens += completionTokens;
      stats.byModel[modelKey].cachedTokens += cachedTokens;
      stats.byModel[modelKey].cost += entryCost;
      if (new Date(r.timestamp) > new Date(stats.byModel[modelKey].lastUsed)) stats.byModel[modelKey].lastUsed = r.timestamp;

      if (r.connectionId) {
        const accountName = connectionMap[r.connectionId] || `Account ${r.connectionId.slice(0, 8)}...`;
        const accountKey = `${r.model} (${r.provider} - ${accountName})`;
        if (!stats.byAccount[accountKey]) {
          stats.byAccount[accountKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, connectionId: r.connectionId, accountName, lastUsed: r.timestamp };
        }
        stats.byAccount[accountKey].requests++;
        stats.byAccount[accountKey].promptTokens += promptTokens;
        stats.byAccount[accountKey].completionTokens += completionTokens;
        stats.byAccount[accountKey].cachedTokens += cachedTokens;
        stats.byAccount[accountKey].cost += entryCost;
        if (new Date(r.timestamp) > new Date(stats.byAccount[accountKey].lastUsed)) stats.byAccount[accountKey].lastUsed = r.timestamp;
      }

      if (r.apiKey && typeof r.apiKey === "string") {
        const keyInfo = apiKeyMap[r.apiKey];
        const keyName = keyInfo?.name || r.apiKey.slice(0, 8) + "...";
        const apiKeyMasked = maskApiKey(r.apiKey);
        const akKey = `${apiKeyMasked}|${r.model}|${r.provider || "unknown"}`;
        if (!stats.byApiKey[akKey]) {
          stats.byApiKey[akKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, apiKeyMasked, keyName, apiKeyKey: apiKeyMasked, lastUsed: r.timestamp };
        }
        const ake = stats.byApiKey[akKey];
        ake.requests++; ake.promptTokens += promptTokens; ake.completionTokens += completionTokens; ake.cachedTokens += cachedTokens; ake.cost += entryCost;
        if (new Date(r.timestamp) > new Date(ake.lastUsed)) ake.lastUsed = r.timestamp;
      } else {
        if (!stats.byApiKey["local-no-key"]) {
          stats.byApiKey["local-no-key"] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, apiKeyMasked: null, keyName: "Local (No API Key)", apiKeyKey: "local-no-key", lastUsed: r.timestamp };
        }
        const ake = stats.byApiKey["local-no-key"];
        ake.requests++; ake.promptTokens += promptTokens; ake.completionTokens += completionTokens; ake.cachedTokens += cachedTokens; ake.cost += entryCost;
        if (new Date(r.timestamp) > new Date(ake.lastUsed)) ake.lastUsed = r.timestamp;
      }

      const endpoint = r.endpoint || "Unknown";
      const epKey = `${endpoint}|${r.model}|${r.provider || "unknown"}`;
      if (!stats.byEndpoint[epKey]) {
        stats.byEndpoint[epKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, endpoint, rawModel: r.model, provider: providerDisplayName, lastUsed: r.timestamp };
      }
      const epe = stats.byEndpoint[epKey];
      epe.requests++; epe.promptTokens += promptTokens; epe.completionTokens += completionTokens; epe.cachedTokens += cachedTokens; epe.cost += entryCost;
      if (new Date(r.timestamp) > new Date(epe.lastUsed)) epe.lastUsed = r.timestamp;
    }
  }

  stats.totalRequests = Object.values(stats.byProvider).reduce((sum, p) => sum + (p.requests || 0), 0);
  return stats;
}

export async function getChartData(period = "7d") {
  const db = await getAdapter();
  const now = Date.now();

  if (period === "today") {
    const bucketCount = 24;
    const bucketMs = 3600000;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTime = startOfDay.getTime();
    const endTime = startTime + bucketCount * bucketMs;
    const labelFn = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({ label: labelFn(startTime + i * bucketMs), tokens: 0, cost: 0 }));

    const rows = db.all(
      `SELECT timestamp, promptTokens, completionTokens, cost FROM usageHistory WHERE timestamp >= ?`,
      [new Date(startTime).toISOString()]
    );
    for (const r of rows) {
      const t = new Date(r.timestamp).getTime();
      if (t < startTime || t >= endTime) continue;
      const idx = Math.floor((t - startTime) / bucketMs);
      if (idx >= 0 && idx < bucketCount) {
        buckets[idx].tokens += (r.promptTokens || 0) + (r.completionTokens || 0);
        buckets[idx].cost += r.cost || 0;
      }
    }
    return buckets;
  }

  if (period === "24h") {
    const bucketCount = 24;
    const bucketMs = 3600000;
    const labelFn = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const startTime = now - bucketCount * bucketMs;
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({ label: labelFn(startTime + i * bucketMs), tokens: 0, cost: 0 }));

    const rows = db.all(
      `SELECT timestamp, promptTokens, completionTokens, cost FROM usageHistory WHERE timestamp >= ?`,
      [new Date(startTime).toISOString()]
    );
    for (const r of rows) {
      const t = new Date(r.timestamp).getTime();
      if (t < startTime || t > now) continue;
      const idx = Math.min(Math.floor((t - startTime) / bucketMs), bucketCount - 1);
      buckets[idx].tokens += (r.promptTokens || 0) + (r.completionTokens || 0);
      buckets[idx].cost += r.cost || 0;
    }
    return buckets;
  }

  const bucketCount = period === "7d" ? 7 : period === "30d" ? 30 : 60;
  const today = new Date();
  const labelFn = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // Build map of dateKey → day data
  const dayRows = loadDaysInRange(db, bucketCount);
  const dayMap = {};
  for (const r of dayRows) dayMap[r.dateKey] = parseJson(r.data, {});

  return Array.from({ length: bucketCount }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (bucketCount - 1 - i));
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayData = dayMap[dateKey];
    return {
      label: labelFn(d),
      tokens: dayData ? (dayData.promptTokens || 0) + (dayData.completionTokens || 0) : 0,
      cost: dayData ? (dayData.cost || 0) : 0,
    };
  });
}

function formatLogDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// No-op: request log is now derived from usageHistory table on read.
export async function appendRequestLog() {}

export async function getRecentLogs(limit = 200) {
  try {
    const db = await getAdapter();
    const rows = db.all(
      `SELECT timestamp, provider, model, connectionId, promptTokens, completionTokens, status, tokens FROM usageHistory ORDER BY id DESC LIMIT ?`,
      [limit],
    );
    if (!rows.length) return [];

    const connMap = {};
    try {
      const { getProviderConnections } = await import("./connectionsRepo.js");
      const connections = await getProviderConnections();
      for (const c of connections) connMap[c.id] = c.name || c.email || "";
    } catch {}

    return rows.map((r) => {
      const ts = formatLogDate(new Date(r.timestamp));
      const p = r.provider?.toUpperCase() || "-";
      const m = r.model || "-";
      const account = connMap[r.connectionId] || (r.connectionId ? r.connectionId.slice(0, 8) : "-");
      const tk = r.tokens ? parseJson(r.tokens, {}) : {};
      const sent = r.promptTokens ?? tk.prompt_tokens ?? "-";
      const received = r.completionTokens ?? tk.completion_tokens ?? "-";
      return `${ts} | ${m} | ${p} | ${account} | ${sent} | ${received} | ${r.status || "-"}`;
    });
  } catch (e) {
    console.error("[usageRepo] getRecentLogs failed:", e.message);
    return [];
  }
}

const HEATMAP_DAYS = 60;
const TOKEN_BENCHMARKS = [
  { label: "The Lord of the Rings trilogy", tokens: 750_000 },
  { label: "the Harry Potter series", tokens: 1_400_000 },
  { label: "War and Peace", tokens: 650_000 },
];

function overviewWhereClause(period, apiKey = null) {
  const parts = [];
  const params = [];
  if (period === "today") {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    parts.push("timestamp >= ?");
    params.push(startOfDay.toISOString());
  } else if (period === "24h") {
    parts.push("timestamp >= ?");
    params.push(new Date(Date.now() - PERIOD_MS["24h"]).toISOString());
  } else if (period === "7d") {
    parts.push("timestamp >= datetime('now', '-7 days')");
  } else if (period === "30d") {
    parts.push("timestamp >= datetime('now', '-30 days')");
  } else if (period === "60d") {
    parts.push("timestamp >= datetime('now', '-60 days')");
  }
  if (apiKey) {
    parts.push("apiKey = ?");
    params.push(apiKey);
  }
  const sql = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { sql, params };
}

function appendWhereClause(baseWhere, extraSql, extraParams = []) {
  if (!extraSql) {
    return { sql: baseWhere.sql, params: [...baseWhere.params] };
  }
  if (baseWhere.sql) {
    return {
      sql: `${baseWhere.sql} AND ${extraSql}`,
      params: [...baseWhere.params, ...extraParams],
    };
  }
  return { sql: `WHERE ${extraSql}`, params: [...extraParams] };
}

function computeStreaks(dateKeys) {
  if (!dateKeys.length) return { current: 0, longest: 0 };
  const sorted = [...dateKeys].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T12:00:00`);
    const curr = new Date(`${sorted[i]}T12:00:00`);
    const gap = Math.round((curr - prev) / 86400000);
    run = gap === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  let current = 0;
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  while (true) {
    const key = getLocalDateKey(cursor.toISOString());
    if (!sorted.includes(key)) break;
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, longest };
}

function buildTokenComparison(totalTokens) {
  if (!totalTokens || totalTokens < 50_000) return null;
  for (const bench of TOKEN_BENCHMARKS) {
    const ratio = totalTokens / bench.tokens;
    if (ratio >= 0.45 && ratio <= 2.2) {
      return `You've used about as many tokens as ${bench.label}.`;
    }
    if (ratio > 2.2) {
      return `You've used ~${Math.round(ratio)}× more tokens than ${bench.label}.`;
    }
  }
  const lotr = TOKEN_BENCHMARKS[0];
  const ratio = totalTokens / lotr.tokens;
  if (ratio >= 2) return `You've used ~${Math.round(ratio)}× more tokens than ${lotr.label}.`;
  return null;
}

function overviewPeriodMaxDays(period) {
  if (period === "7d") return 7;
  if (period === "30d") return 30;
  if (period === "60d") return 60;
  return null;
}

function formatChartDateLabel(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function accumulateModelStats(modelTotals, dailyByModel, dateKey, m, mk) {
  const rawModel = m.meta?.rawModel || m.rawModel || mk.split("|")[0];
  if (!rawModel) return;
  const provider = m.meta?.provider || m.provider || mk.split("|")[1] || "";
  if (!modelTotals[rawModel]) {
    modelTotals[rawModel] = {
      model: rawModel,
      provider,
      promptTokens: 0,
      completionTokens: 0,
    };
  }
  modelTotals[rawModel].promptTokens += m.promptTokens || 0;
  modelTotals[rawModel].completionTokens += m.completionTokens || 0;
  if (m.requests) {
    modelTotals[rawModel].requests = (modelTotals[rawModel].requests || 0) + m.requests;
  }

  if (dateKey) {
    dailyByModel[dateKey] ||= {};
    dailyByModel[dateKey][rawModel] =
      (dailyByModel[dateKey][rawModel] || 0) + (m.completionTokens || 0);
  }
}

function loadModelStatsFromHistory(db, where, modelTotals, dailyByModel) {
  const histRows = db.all(
    `SELECT date(timestamp) AS d, model, provider,
            COUNT(*) AS requests,
            SUM(COALESCE(promptTokens, 0)) AS promptTokens,
            SUM(COALESCE(completionTokens, 0)) AS completionTokens
     FROM usageHistory ${where.sql}
     GROUP BY d, model, provider
     ORDER BY d ASC`,
    where.params,
  );
  for (const r of histRows) {
    accumulateModelStats(
      modelTotals,
      dailyByModel,
      r.d,
      {
        rawModel: r.model,
        provider: r.provider,
        promptTokens: Number(r.promptTokens) || 0,
        completionTokens: Number(r.completionTokens) || 0,
        requests: Number(r.requests) || 0,
      },
      r.provider ? `${r.model}|${r.provider}` : r.model,
    );
  }
}

function buildModelsAnalytics(db, period, where = overviewWhereClause(period)) {
  const maxDays = overviewPeriodMaxDays(period);
  const modelTotals = {};
  const dailyByModel = {};
  const useHistoryOnly = where.params.length > 0;

  if (!useHistoryOnly) {
    const dayRows = loadDaysInRange(db, maxDays);
    if (dayRows.length) {
      for (const dr of dayRows) {
        const day = parseJson(dr.data, {});
        for (const [mk, m] of Object.entries(day.byModel || {})) {
          accumulateModelStats(modelTotals, dailyByModel, dr.dateKey, m, mk);
        }
      }
    }
  }
  if (!Object.keys(modelTotals).length) {
    loadModelStatsFromHistory(db, where, modelTotals, dailyByModel);
  }

  const sorted = Object.values(modelTotals).sort(
    (a, b) => b.completionTokens - a.completionTokens,
  );
  const totalOut = sorted.reduce((s, m) => s + (m.completionTokens || 0), 0);
  const topN = 6;
  const topModels = sorted.slice(0, topN);
  const topKeys = new Set(topModels.map((m) => m.model));
  const hasOther = sorted.length > topN;

  const dateKeys = Object.keys(dailyByModel).sort();
  const chartSeries = dateKeys.map((dateKey) => {
    const row = { label: formatChartDateLabel(dateKey), dateKey };
    let other = 0;
    for (const [model, out] of Object.entries(dailyByModel[dateKey] || {})) {
      if (topKeys.has(model)) row[model] = out;
      else other += out;
    }
    if (hasOther && other > 0) row.Other = other;
    return row;
  });

  const stackKeys = [...topModels.map((m) => m.model), ...(hasOther ? ["Other"] : [])];
  const breakdown = sorted.map((m) => ({
    model: m.model,
    provider: m.provider || "",
    promptTokens: m.promptTokens || 0,
    completionTokens: m.completionTokens || 0,
    percentage: totalOut > 0 ? (m.completionTokens / totalOut) * 100 : 0,
  }));

  const totalIn = sorted.reduce((s, m) => s + (m.promptTokens || 0), 0);
  const totalRequests = sorted.reduce((s, m) => s + (m.requests || 0), 0);

  return {
    chartSeries,
    stackKeys,
    breakdown,
    summary: {
      modelCount: sorted.length,
      totalInput: totalIn,
      totalOutput: totalOut,
      totalRequests,
      topModel: sorted[0]?.model || null,
      topModelShare: sorted[0] && totalOut > 0
        ? (sorted[0].completionTokens / totalOut) * 100
        : 0,
    },
  };
}

function resolveFavoriteProvider(db, where) {
  const clause = appendWhereClause(
    where,
    "provider IS NOT NULL AND provider != ''",
  );
  const row = db.get(
    `SELECT provider, COUNT(*) AS cnt FROM usageHistory ${clause.sql} GROUP BY provider ORDER BY cnt DESC LIMIT 1`,
    clause.params,
  );
  return row?.provider || null;
}

function resolveTotalCachedTokens(db, where, period) {
  let total = 0;
  const rows = db.all(`SELECT tokens FROM usageHistory ${where.sql}`, where.params);
  for (const r of rows) {
    const t = parseJson(r.tokens, {}) || {};
    total += Number(t.cached_tokens || t.cache_read_input_tokens || 0);
  }
  if (total > 0 || where.params.length > 0) return total;

  const maxDays = overviewPeriodMaxDays(period);
  const dayRows = loadDaysInRange(db, maxDays);
  for (const dr of dayRows) {
    const day = parseJson(dr.data, {});
    total += Number(day.cachedTokens || 0);
  }
  return total;
}

function resolveActiveProvidersFromUsage(db, where) {
  const clause = appendWhereClause(where, "provider IS NOT NULL AND provider != ''");
  const row = db.get(
    `SELECT COUNT(DISTINCT provider) AS cnt FROM usageHistory ${clause.sql}`,
    clause.params,
  );
  return row?.cnt || 0;
}

async function resolveActiveProviderCount() {
  return countActiveProviders();
}

export async function getUsageOverview(period = "all", options = {}) {
  const db = await getAdapter();
  let apiKey = null;
  if (options.apiKeyId) {
    const { getApiKeys } = await import("./apiKeysRepo.js");
    const match = (await getApiKeys()).find((k) => k.id === options.apiKeyId);
    apiKey = match?.key || null;
  }
  const where = overviewWhereClause(period, apiKey);

  const totals = db.get(
    `SELECT
       COUNT(*) AS requests,
       SUM(COALESCE(promptTokens, 0)) AS totalPromptTokens,
       SUM(COALESCE(completionTokens, 0)) AS totalCompletionTokens,
       SUM(COALESCE(promptTokens, 0) + COALESCE(completionTokens, 0)) AS totalTokens
     FROM usageHistory ${where.sql}`,
    where.params,
  ) || { requests: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0 };

  const activeProviders = apiKey
    ? resolveActiveProvidersFromUsage(db, where)
    : await resolveActiveProviderCount();

  const costRow = db.get(
    `SELECT SUM(COALESCE(cost, 0)) AS totalCost FROM usageHistory ${where.sql}`,
    where.params,
  ) || { totalCost: 0 };

  const activeDaysRow = db.get(
    `SELECT COUNT(DISTINCT date(timestamp)) AS activeDays FROM usageHistory ${where.sql}`,
    where.params,
  ) || { activeDays: 0 };

  const favoriteModelRow = db.get(
    `SELECT model, COUNT(*) AS cnt
     FROM usageHistory ${where.sql}
     GROUP BY model
     ORDER BY cnt DESC
     LIMIT 1`,
    where.params,
  );

  const favoriteProvider = resolveFavoriteProvider(db, where);
  const totalCachedTokens = resolveTotalCachedTokens(db, where, period);
  const modelsAnalytics = buildModelsAnalytics(db, period, where);

  const streakDateWhere = appendWhereClause(where, "timestamp IS NOT NULL");
  const allDateRows = db.all(
    `SELECT DISTINCT date(timestamp) AS d FROM usageHistory ${streakDateWhere.sql} ORDER BY d ASC`,
    streakDateWhere.params,
  );
  const streaks = computeStreaks(allDateRows.map((r) => r.d).filter(Boolean));

  const topModels = db.all(
    `SELECT model, provider,
            COUNT(*) AS requests,
            SUM(COALESCE(promptTokens, 0) + COALESCE(completionTokens, 0)) AS tokens
     FROM usageHistory ${where.sql}
     GROUP BY model, provider
     ORDER BY requests DESC
     LIMIT 8`,
    where.params,
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(today);
  const rangeStart = new Date(rangeEnd);
  rangeStart.setDate(rangeStart.getDate() - (HEATMAP_DAYS - 1));

  const heatmapCutoff = getLocalDateKey(rangeStart.toISOString());
  const dayMap = {};

  if (!apiKey) {
    const dayRows = db.all(
      `SELECT dateKey,
              json_extract(data, '$.requests') AS requests,
              json_extract(data, '$.promptTokens') AS promptTokens,
              json_extract(data, '$.completionTokens') AS completionTokens
       FROM usageDaily
       WHERE dateKey >= ?`,
      [heatmapCutoff],
    );
    for (const row of dayRows) {
      dayMap[row.dateKey] = {
        requests: Number(row.requests) || 0,
        tokens: (Number(row.promptTokens) || 0) + (Number(row.completionTokens) || 0),
      };
    }
  }

  if (!Object.keys(dayMap).length) {
    const heatmapWhere = appendWhereClause(where, "date(timestamp) >= ?", [heatmapCutoff]);
    const histDays = db.all(
      `SELECT date(timestamp) AS d,
              COUNT(*) AS requests,
              SUM(COALESCE(promptTokens, 0) + COALESCE(completionTokens, 0)) AS tokens
       FROM usageHistory ${heatmapWhere.sql}
       GROUP BY d`,
      heatmapWhere.params,
    );
    for (const row of histDays) {
      dayMap[row.d] = {
        requests: Number(row.requests) || 0,
        tokens: Number(row.tokens) || 0,
      };
    }
  }

  const heatmap = buildHeatmapGrid(dayMap);

  return {
    period,
    apiKeyId: options.apiKeyId || null,
    activeProviders,
    messages: totals.requests || 0,
    totalTokens: totals.totalTokens || 0,
    totalPromptTokens: totals.totalPromptTokens || 0,
    totalCompletionTokens: totals.totalCompletionTokens || 0,
    totalCost: costRow.totalCost || 0,
    activeDays: activeDaysRow.activeDays || 0,
    totalCachedTokens,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    favoriteProvider,
    favoriteModel: favoriteModelRow?.model || null,
    topModels: topModels.map((m) => ({
      model: m.model,
      provider: m.provider || "",
      requests: m.requests || 0,
      tokens: m.tokens || 0,
    })),
    modelsAnalytics,
    heatmap,
    comparison: buildTokenComparison(totals.totalTokens || 0),
  };
}

function emptyApiKeyUsageRow(key) {
  return {
    id: key.id,
    name: key.name,
    isActive: key.isActive !== false,
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    cost: 0,
    lastUsed: null,
  };
}

function mergeApiKeyUsageRow(row, vals) {
  row.requests += vals.requests || 0;
  row.promptTokens += vals.promptTokens || 0;
  row.completionTokens += vals.completionTokens || 0;
  row.cachedTokens += vals.cachedTokens || 0;
  row.cost += vals.cost || 0;
  if (vals.lastUsed && (!row.lastUsed || vals.lastUsed > row.lastUsed)) {
    row.lastUsed = vals.lastUsed;
  }
}

/** Per registered API key usage rollup for the Endpoint → API Keys UI. */
export async function getApiKeyUsageSummary(period = "today") {
  const db = await getAdapter();
  const { getApiKeys } = await import("./apiKeysRepo.js");
  const allApiKeys = await getApiKeys();

  const byId = Object.fromEntries(allApiKeys.map((k) => [k.id, emptyApiKeyUsageRow(k)]));
  const keyIdByValue = Object.fromEntries(allApiKeys.map((k) => [k.key, k.id]));

  const useDaily = period !== "24h" && period !== "today";

  if (useDaily) {
    const periodDays = { "7d": 7, "30d": 30, "60d": 60, all: null };
    const dayRows = loadDaysInRange(db, periodDays[period] ?? null);
    for (const dr of dayRows) {
      const day = parseJson(dr.data, {});
      for (const ak of Object.values(day.byApiKey || {})) {
        const fullKey = ak.apiKey;
        const keyId = fullKey ? keyIdByValue[fullKey] : null;
        if (!keyId) continue;
        mergeApiKeyUsageRow(byId[keyId], {
          requests: ak.requests,
          promptTokens: ak.promptTokens,
          completionTokens: ak.completionTokens,
          cachedTokens: ak.cachedTokens,
          cost: ak.cost,
          lastUsed: dr.dateKey,
        });
      }
    }
  } else {
    let cutoff;
    if (period === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      cutoff = startOfDay.toISOString();
    } else {
      cutoff = new Date(Date.now() - PERIOD_MS["24h"]).toISOString();
    }

    const rows = db.all(
      `SELECT apiKey, promptTokens, completionTokens, cost, timestamp, tokens
       FROM usageHistory WHERE timestamp >= ?`,
      [cutoff]
    );

    for (const r of rows) {
      const keyId = r.apiKey ? keyIdByValue[r.apiKey] : null;
      if (!keyId) continue;
      const tokens = parseJson(r.tokens, {}) || {};
      mergeApiKeyUsageRow(byId[keyId], {
        requests: 1,
        promptTokens: tokens.prompt_tokens || tokens.input_tokens || r.promptTokens || 0,
        completionTokens: tokens.completion_tokens || tokens.output_tokens || r.completionTokens || 0,
        cachedTokens: tokens.cached_tokens || tokens.cache_read_input_tokens || 0,
        cost: r.cost || 0,
        lastUsed: r.timestamp,
      });
    }
  }

  return {
    period,
    keys: allApiKeys.map((k) => byId[k.id]),
  };
}
