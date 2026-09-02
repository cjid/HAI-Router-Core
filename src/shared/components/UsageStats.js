"use client";

import MdiIcon from "@/shared/components/MdiIcon";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FREE_PROVIDERS, AI_PROVIDERS } from "@/shared/constants/providers";

// Keep providers without serviceKinds (default LLM) or with "llm" in serviceKinds
function isLLMProvider(id) {
  const p = AI_PROVIDERS[id];
  if (!p?.serviceKinds) return true;
  return p.serviceKinds.includes("llm");
}
import Badge from "./Badge";
import Card from "./Card";
import Select from "./Select";
import ProviderIcon from "./ProviderIcon";
import { getLlmTurnBadgeClass, getLlmTurnLabel } from "@/shared/utils/llmTurnType";
import OverviewCards from "@/app/(dashboard)/dashboard/usage/components/OverviewCards";
import UsageTable, { fmt, fmtTime } from "@/app/(dashboard)/dashboard/usage/components/UsageTable";
import dynamic from "next/dynamic";
// Lazy-load: keeps @xyflow/react out of the shared bundle until topology renders
const ProviderTopology = dynamic(() => import("@/app/(dashboard)/dashboard/usage/components/ProviderTopology"), { ssr: false });
import UsageChart from "@/app/(dashboard)/dashboard/usage/components/UsageChart";
import { mergeRealtimeStats } from "@/shared/utils/usageStatsMerge";

function timeAgo(timestamp) {
  const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Auto-update time display every second without re-rendering parent
function TimeAgo({ timestamp }) {
  const [, setTick] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  
  return <>{timeAgo(timestamp)}</>;
}

function activeRequestsFromStats(stats) {
  const fromServer = stats?.activeRequests || [];
  if (fromServer.length > 0) return fromServer;

  const pending = stats?.pending?.byModel || {};
  const derived = [];
  for (const [modelKey, count] of Object.entries(pending)) {
    if (count <= 0) continue;
    const match = modelKey.match(/^(.*) \((.*)\)$/);
    derived.push({
      model: match ? match[1] : modelKey,
      provider: match ? match[2] : "unknown",
      account: "Public",
      count,
    });
  }
  return derived;
}

function buildProviderLookup(providers) {
  const map = {};
  for (const p of providers) {
    const id = p.provider || p.id;
    if (!id) continue;
    const builtIn = AI_PROVIDERS[id];
    map[id] = {
      name: builtIn?.name || p.nodeName || id,
      baseUrl: p.baseUrl || null,
      compatibility: p.compatibility || null,
      apiType: p.apiType || null,
      color: builtIn?.color || (p.compatibility === "anthropic" ? "#D97757" : p.compatibility === "openai" ? "#10A37F" : "#6b7280"),
      textIcon: builtIn?.textIcon || (builtIn?.name || id).slice(0, 2).toUpperCase(),
    };
  }
  return map;
}

function resolveProviderDisplayName(request, providerMeta) {
  return AI_PROVIDERS[request.provider]?.name || providerMeta?.name || request.provider || "Unknown";
}

function resolveAccountIdentity(request, connectionNameMap, singleAccountByProvider) {
  if (request.connectionId && connectionNameMap[request.connectionId]) {
    return connectionNameMap[request.connectionId];
  }
  if (singleAccountByProvider[request.provider]) {
    return singleAccountByProvider[request.provider];
  }
  if (!request.connectionId || request.connectionId === "noauth") return "Public";
  return `Account ${request.connectionId.slice(0, 8)}...`;
}

function resolveRecentRequestSubline(request, connectionNameMap, singleAccountByProvider) {
  const account = resolveAccountIdentity(request, connectionNameMap, singleAccountByProvider);
  const model = request.model || "—";
  return `${account} · ${model}`;
}

function resolveProviderMeta(providerId, lookup) {
  if (!providerId) return null;
  if (lookup[providerId]) return lookup[providerId];
  const builtIn = AI_PROVIDERS[providerId];
  if (builtIn) {
    return {
      name: builtIn.name || providerId,
      baseUrl: null,
      compatibility: null,
      apiType: null,
      color: builtIn.color || "#6b7280",
      textIcon: builtIn.textIcon || providerId.slice(0, 2).toUpperCase(),
    };
  }
  return {
    name: providerId,
    baseUrl: null,
    compatibility: null,
    apiType: null,
    color: "#6b7280",
    textIcon: providerId.slice(0, 2).toUpperCase(),
  };
}

function TurnTypeBadge({ turnType }) {
  if (!turnType || turnType === "unknown") return null;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${getLlmTurnBadgeClass(turnType)}`}>
      {getLlmTurnLabel(turnType)}
    </span>
  );
}

function StreamStatusBadge({ request }) {
  const isPartial = request.status === "partial" || request.usageStatus === "partial" || request.usageStatus === "estimated";
  if (!isPartial && (!request.terminationReason || request.terminationReason === "completed")) return null;

  const label = request.usageStatus === "estimated"
    ? "Estimated"
    : request.terminationReason === "client_cancelled"
      ? "Cancelled"
      : request.terminationReason === "upstream_aborted"
        ? "Aborted"
        : "Partial";

  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none bg-amber-500/15 text-amber-700 dark:text-amber-300"
      title={request.terminationReason ? `Termination: ${request.terminationReason.replace(/_/g, " ")}` : undefined}
    >
      {label}
    </span>
  );
}

function TestModelBadge({ requestKind }) {
  if (requestKind !== "model_test") return null;
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">
      Test Model
    </span>
  );
}

function RecentRequestRow({ request, providerMeta, connectionNameMap, singleAccountByProvider }) {
  const ok = !request.status || request.status === "ok" || request.status === "success";
  const partial = request.status === "partial" || request.usageStatus === "partial" || request.usageStatus === "estimated";
  const providerName = resolveProviderDisplayName(request, providerMeta);
  const subline = resolveRecentRequestSubline(request, connectionNameMap, singleAccountByProvider);
  const title = `${providerName} · ${subline}${request.terminationReason ? ` · ${request.terminationReason}` : ""}`;
  const outPrefix = request.usageEstimated ? "~" : "";

  return (
    <li
      className="group flex items-center gap-2.5 border-b border-border/40 px-2.5 py-2.5 last:border-b-0 hover:bg-bg-subtle/60 transition-colors"
      title={title}
    >
      <div
        className={`relative flex size-8 shrink-0 items-center justify-center rounded-lg border bg-bg-subtle/40 p-0.5 ${
          ok && !partial ? "border-border/60" : partial ? "border-amber-500/40" : "border-error/40"
        }`}
      >
        <ProviderIcon
          providerId={request.provider}
          completionBaseUrl={providerMeta?.baseUrl}
          compatibility={providerMeta?.compatibility}
          apiType={providerMeta?.apiType}
          src={providerMeta?.baseUrl ? null : undefined}
          alt={providerName}
          size={22}
          className="rounded object-contain"
          fallbackText={providerMeta?.textIcon || "?"}
          fallbackColor={providerMeta?.color}
        />
        <span
          className={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-bg ${
            ok && !partial ? "bg-success" : partial ? "bg-amber-500" : "bg-error"
          }`}
          aria-hidden
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="truncate text-xs font-medium text-text-main leading-tight">{providerName}</p>
          <TestModelBadge requestKind={request.requestKind} />
          <TurnTypeBadge turnType={request.turnType} />
          <StreamStatusBadge request={request} />
        </div>
        <p className="truncate font-mono text-[11px] text-text-muted leading-tight mt-0.5">{subline}</p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[11px] text-text-muted whitespace-nowrap mb-1">
          <TimeAgo timestamp={request.timestamp} />
        </p>
        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
          <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary">
            {fmt(request.promptTokens)}↑
          </span>
          <span className="inline-flex items-center rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-success">
            {outPrefix}{fmt(request.completionTokens)}↓
          </span>
        </div>
      </div>
    </li>
  );
}

function RecentRequests({ requests = [], providers = [], connectionNameMap = {}, singleAccountByProvider = {} }) {
  const providerLookup = useMemo(() => buildProviderLookup(providers), [providers]);

  return (
    <Card className="flex min-w-0 flex-col overflow-hidden" padding="none" style={{ height: 480 }}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5 shrink-0 bg-bg-subtle/30">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Recent Requests</span>
        {requests.length > 0 && (
          <span className="text-[10px] font-medium text-text-muted tabular-nums">{requests.length}</span>
        )}
      </div>

      {!requests.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-text-muted">
          <MdiIcon name="history" size={28} className="opacity-40" />
          <p className="text-sm">No requests yet.</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto overflow-x-hidden">
          {requests.map((r, i) => (
            <RecentRequestRow
              key={`${r.timestamp}-${r.provider}-${r.model}-${i}`}
              request={r}
              providerMeta={resolveProviderMeta(r.provider, providerLookup)}
              connectionNameMap={connectionNameMap}
              singleAccountByProvider={singleAccountByProvider}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function sortData(dataMap, pendingMap = {}, sortBy, sortOrder) {
  return Object.entries(dataMap || {})
    .map(([key, data]) => {
      const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
      const totalCost = data.cost || 0;
      // ponytail: cost split is a token-share allocation of the (rate-accurate)
      // server total, not a per-rate recompute. cached is a subset of prompt, so
      // peel it out of the input share. Upgrade to a stored per-component cost
      // breakdown if exact cached-rate cost display is needed.
      const cachedTokens = data.cachedTokens || 0;
      const nonCachedInput = Math.max(0, (data.promptTokens || 0) - cachedTokens);
      const inputCost = totalTokens > 0 ? nonCachedInput * (totalCost / totalTokens) : 0;
      const cachedCost = totalTokens > 0 ? cachedTokens * (totalCost / totalTokens) : 0;
      const outputCost = totalTokens > 0 ? (data.completionTokens || 0) * (totalCost / totalTokens) : 0;
      return { ...data, key, totalTokens, totalCost, inputCost, cachedCost, outputCost, pending: pendingMap[key] || 0 };
    })
    .sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
}

function getGroupKey(item, keyField) {
  switch (keyField) {
    case "rawModel": return item.rawModel || "Unknown Model";
    case "accountName": return item.accountName || `Account ${item.connectionId?.slice(0, 8)}...` || "Unknown Account";
    case "keyName": return item.keyName || "Unknown Key";
    case "endpoint": return item.endpoint || "Unknown Endpoint";
    default: return item[keyField] || "Unknown";
  }
}

function groupDataByKey(data, keyField) {
  if (!Array.isArray(data)) return [];
  const groups = {};
  data.forEach((item) => {
    const gk = getGroupKey(item, keyField);
    if (!groups[gk]) {
      groups[gk] = {
        groupKey: gk,
        summary: { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0, cost: 0, inputCost: 0, cachedCost: 0, outputCost: 0, lastUsed: null, pending: 0 },
        items: [],
      };
    }
    const s = groups[gk].summary;
    s.requests += item.requests || 0;
    s.promptTokens += item.promptTokens || 0;
    s.completionTokens += item.completionTokens || 0;
    s.cachedTokens += item.cachedTokens || 0;
    s.totalTokens += item.totalTokens || 0;
    s.cost += item.cost || 0;
    s.inputCost += item.inputCost || 0;
    s.cachedCost += item.cachedCost || 0;
    s.outputCost += item.outputCost || 0;
    s.pending += item.pending || 0;
    if (item.lastUsed && (!s.lastUsed || new Date(item.lastUsed) > new Date(s.lastUsed))) {
      s.lastUsed = item.lastUsed;
    }
    groups[gk].items.push(item);
  });
  return Object.values(groups);
}

const MODEL_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ACCOUNT_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "accountName", label: "Account" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const API_KEY_COLUMNS = [
  { field: "keyName", label: "API Key Name" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ENDPOINT_COLUMNS = [
  { field: "endpoint", label: "Endpoint" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const TABLE_OPTIONS = [
  { value: "model", label: "Usage by Model" },
  { value: "account", label: "Usage by Account" },
  { value: "apiKey", label: "Usage by API Key" },
  { value: "endpoint", label: "Usage by Endpoint" },
];

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

export default function UsageStats({ period: periodProp, setPeriod: setPeriodProp, hidePeriodSelector = false } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sortBy = searchParams.get("sortBy") || "rawModel";
  const sortOrder = searchParams.get("sortOrder") || "asc";

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [tableView, setTableView] = useState("model");
  const [viewMode, setViewMode] = useState("costs");
  const [providers, setProviders] = useState([]);
  const [connectionNameMap, setConnectionNameMap] = useState({});
  const [singleAccountByProvider, setSingleAccountByProvider] = useState({});
  const [periodLocal, setPeriodLocal] = useState("today");
  const isInitialLoad = useRef(true);
  const hasLoadedStats = useRef(false);
  const periodGenRef = useRef(0);
  const period = periodProp ?? periodLocal;
  const setPeriod = setPeriodProp ?? setPeriodLocal;

  // Fetch connected providers once, deduplicate by provider type.
  // noAuth free providers (e.g. opencode, mimo-free) only when enabled in providerStates.
  useEffect(() => {
    Promise.all([
      fetch("/api/providers").then((r) => r.ok ? r.json() : null),
      fetch("/api/provider-nodes").then((r) => r.ok ? r.json() : null),
    ])
      .then(([d, nodesData]) => {
        const providerStates = d?.providerStates || {};
        const isProviderEnabled = (id) => providerStates[id] !== false;

        const connNames = {};
        const accountsByProvider = {};
        for (const c of (d?.connections || [])) {
          if (c.isActive === false) continue;
          if (!isProviderEnabled(c.provider)) continue;
          if (c.id) connNames[c.id] = c.name || c.email || c.id;
          if (!accountsByProvider[c.provider]) accountsByProvider[c.provider] = [];
          accountsByProvider[c.provider].push(c.name || c.email || c.id);
        }
        const singleAccount = {};
        for (const [providerId, names] of Object.entries(accountsByProvider)) {
          if (names.length === 1) singleAccount[providerId] = names[0];
        }
        setConnectionNameMap(connNames);
        setSingleAccountByProvider(singleAccount);

        const nodeMetaMap = {};
        for (const node of (nodesData?.nodes || [])) {
          nodeMetaMap[node.id] = {
            name: node.name,
            baseUrl: node.baseUrl,
            compatibility: node.type === "anthropic-compatible"
              ? "anthropic"
              : node.type === "openai-compatible"
                ? "openai"
                : null,
            apiType: node.apiType,
          };
        }
        const seen = new Set();
        const unique = (d?.connections || []).filter((c) => {
          if (c.isActive === false) return false;
          if (!isProviderEnabled(c.provider)) return false;
          if (!isLLMProvider(c.provider)) return false;
          if (seen.has(c.provider)) return false;
          seen.add(c.provider);
          return true;
        }).map((c) => {
          const meta = nodeMetaMap[c.provider] || {};
          return {
            ...c,
            nodeName: meta.name || null,
            baseUrl: meta.baseUrl || c.providerSpecificData?.baseUrl || null,
            compatibility: meta.compatibility || null,
            apiType: meta.apiType || c.providerSpecificData?.apiType || null,
          };
        });
        const noAuthProviders = Object.values(FREE_PROVIDERS)
          .filter((p) => p.noAuth && !seen.has(p.id) && isLLMProvider(p.id) && isProviderEnabled(p.id))
          .map((p) => ({ provider: p.id, name: p.name }));
        setProviders([...unique, ...noAuthProviders]);
      })
      .catch(() => {});
  }, []);

  // Single coordinated load: REST baseline + SSE live patches, generation-guarded against races.
  useEffect(() => {
    const gen = ++periodGenRef.current;
    const ac = new AbortController();

    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      setLoading(true);
    } else {
      setFetching(true);
    }

    fetch(`/api/usage/stats?period=${encodeURIComponent(period)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (gen !== periodGenRef.current || !data) return;
        hasLoadedStats.current = true;
        setStats(data);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
      })
      .finally(() => {
        if (gen !== periodGenRef.current) return;
        setLoading(false);
        setFetching(false);
      });

    const es = new EventSource(`/api/usage/stream?period=${encodeURIComponent(period)}`);

    es.onmessage = (e) => {
      if (gen !== periodGenRef.current) return;
      try {
        const data = JSON.parse(e.data);
        setStats((prev) => mergeRealtimeStats(prev, data, period));
        if (hasLoadedStats.current || data.activeRequests?.length > 0 || Object.keys(data.pending?.byModel || {}).length > 0) {
          setLoading(false);
        }
      } catch (err) {
        console.error("[SSE CLIENT] parse error:", err);
      }
    };

    es.onerror = () => {
      if (gen === periodGenRef.current) setLoading(false);
    };

    return () => {
      ac.abort();
      es.close();
    };
  }, [period]);

  const toggleSort = useCallback((tableType, field) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("sortBy") === field) {
      params.set("sortOrder", params.get("sortOrder") === "asc" ? "desc" : "asc");
    } else {
      params.set("sortBy", field);
      params.set("sortOrder", "asc");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const topologyActiveRequests = useMemo(
    () => activeRequestsFromStats(stats),
    [stats?.activeRequests, stats?.pending]
  );

  // Compute active table data
  const activeTableConfig = useMemo(() => {
    if (!stats) return null;
    switch (tableView) {
      case "model": {
        const pendingMap = stats.pending?.byModel || {};
        return {
          columns: MODEL_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byModel, pendingMap, sortBy, sortOrder), "rawModel"),
          storageKey: "usage-stats:expanded-models",
          emptyMessage: "No usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "account": {
        const pendingMap = {};
        if (stats?.pending?.byAccount) {
          Object.entries(stats.byAccount || {}).forEach(([accountKey, data]) => {
            const connPending = stats.pending.byAccount[data.connectionId];
            if (connPending) {
              const modelKey = data.provider ? `${data.rawModel} (${data.provider})` : data.rawModel;
              pendingMap[accountKey] = connPending[modelKey] || 0;
            }
          });
        }
        return {
          columns: ACCOUNT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byAccount, pendingMap, sortBy, sortOrder), "accountName"),
          storageKey: "usage-stats:expanded-accounts",
          emptyMessage: "No account-specific usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.accountName || `Account ${item.connectionId?.slice(0, 8)}...`}</td>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "apiKey": {
        return {
          columns: API_KEY_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byApiKey, {}, sortBy, sortOrder), "keyName"),
          storageKey: "usage-stats:expanded-apikeys",
          emptyMessage: "No API key usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium">{item.keyName}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "endpoint":
      default: {
        return {
          columns: ENDPOINT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byEndpoint, {}, sortBy, sortOrder), "endpoint"),
          storageKey: "usage-stats:expanded-endpoints",
          emptyMessage: "No endpoint usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium font-mono text-sm">{item.endpoint}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
    }
  }, [stats, tableView, sortBy, sortOrder]);

  if (!stats && !loading) return <div className="text-text-muted">Failed to load usage statistics.</div>;

  const spinner = (
    <div className="flex items-center justify-center py-12 text-text-muted">
      <MdiIcon name="progress_activity" size={32} spin className="animate-spin" />
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Period selector (hidden when controlled by parent) */}
      {!hidePeriodSelector && (
        <div className="flex w-full items-center gap-2 sm:w-auto sm:self-end">
          <div className="grid flex-1 grid-cols-5 items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1 sm:flex sm:flex-none">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${period === p.value ? "bg-primary text-white shadow-sm" : "text-text-muted hover:bg-bg-hover hover:text-text"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {fetching && (
            <MdiIcon name="progress_activity" size={16} spin className="text-text-muted animate-spin" />
          )}
        </div>
      )}

      {/* Overview cards */}
      {loading ? spinner : <OverviewCards stats={stats} />}

      {/* Provider topology + Recent Requests */}
      {loading ? spinner : (
        <div className="grid min-w-0 grid-cols-1 items-stretch gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <ProviderTopology
            providers={providers}
            activeRequests={topologyActiveRequests}
            lastProvider={stats.recentRequests?.[0]?.provider || ""}
            errorProvider={stats.errorProvider || ""}
          />
          <RecentRequests
            requests={stats.recentRequests || []}
            providers={providers}
            connectionNameMap={connectionNameMap}
            singleAccountByProvider={singleAccountByProvider}
          />
        </div>
      )}

      {/* Token / Cost chart - sync period */}
      {loading ? spinner : <UsageChart period={period} />}

      {/* Table with dropdown selector */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Select
            size="sm"
            value={tableView}
            onChange={(e) => setTableView(e.target.value)}
            options={TABLE_OPTIONS}
            triggerClassName="w-full sm:w-auto"
            aria-label="Usage table view"
          />
          <div className="grid grid-cols-2 items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1 sm:flex">
            <button
              onClick={() => setViewMode("costs")}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === "costs" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
            >
              Costs
            </button>
            <button
              onClick={() => setViewMode("tokens")}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === "tokens" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
            >
              Tokens
            </button>
          </div>
        </div>
        {loading ? spinner : activeTableConfig && (
          <UsageTable
            title=""
            columns={activeTableConfig.columns}
            groupedData={activeTableConfig.groupedData}
            tableType={tableView}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onToggleSort={toggleSort}
            viewMode={viewMode}
            storageKey={activeTableConfig.storageKey}
            renderSummaryCells={activeTableConfig.renderSummaryCells}
            renderDetailCells={activeTableConfig.renderDetailCells}
            emptyMessage={activeTableConfig.emptyMessage}
          />
        )}
      </div>
    </div>
  );
}
