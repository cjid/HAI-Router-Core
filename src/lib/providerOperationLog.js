/**
 * Structured provider operation logging — start + terminal events, sanitized.
 * Lines flow into HAI-Router console log capture via console.info/warn/error.
 */
import { randomUUID } from "crypto";
import { redactProxyUrlForLog } from "@/lib/network/connectionProxy.js";

const SECRET_PATTERNS = [
  /authorization\s*[:=]\s*[^\s]+/gi,
  /bearer\s+[^\s]+/gi,
  /\bsk-[a-zA-Z0-9]{10,}\b/gi,
  /api[_-]?key\s*[:=]\s*[^\s]+/gi,
  /proxy-authorization\s*[:=]\s*[^\s]+/gi,
  /:\/\/[^@\s]+:[^@\s]+@/g,
  /sk-[a-zA-Z0-9]{10,}/g,
];

export function sanitizeProviderLogText(input) {
  let msg = String(input ?? "");
  for (const re of SECRET_PATTERNS) {
    msg = msg.replace(re, "[redacted]");
  }
  return msg;
}

/**
 * @param {object} proxyOptions
 * @param {{ mode?: string, proxyUrl?: string, relayUrl?: string }} [egress]
 */
export function buildEgressLogFields(proxyOptions, egress) {
  if (egress?.mode) {
    const mode = egress.mode;
    if (mode === "proxy") {
      return {
        egressMode: "proxy",
        proxyUsed: true,
        sanitizedProxy: redactProxyUrlForLog(egress.proxyUrl || proxyOptions?.connectionProxyUrl || ""),
      };
    }
    if (mode === "relay") {
      return {
        egressMode: "relay",
        proxyUsed: true,
        sanitizedProxy: redactProxyUrlForLog(egress.relayUrl || proxyOptions?.vercelRelayUrl || ""),
      };
    }
    if (mode === "bypass") {
      return { egressMode: "bypass", proxyUsed: false, sanitizedProxy: null };
    }
    return { egressMode: "direct", proxyUsed: false, sanitizedProxy: null };
  }

  if (proxyOptions?.vercelRelayUrl) {
    return {
      egressMode: "relay",
      proxyUsed: true,
      sanitizedProxy: redactProxyUrlForLog(proxyOptions.vercelRelayUrl),
    };
  }
  if (proxyOptions?.connectionProxyEnabled && proxyOptions?.connectionProxyUrl) {
    return {
      egressMode: "proxy",
      proxyUsed: true,
      sanitizedProxy: redactProxyUrlForLog(proxyOptions.connectionProxyUrl),
    };
  }
  return { egressMode: "direct", proxyUsed: false, sanitizedProxy: null };
}

function formatProviderLine(payload) {
  const parts = ["[PROVIDER]"];
  if (payload.event) parts.push(String(payload.event));
  if (payload.operation) parts.push(`operation=${payload.operation}`);
  if (payload.requestId) parts.push(`request=${payload.requestId}`);
  if (payload.providerId) parts.push(`provider=${payload.providerId}`);
  if (payload.connectionId) parts.push(`connection=${payload.connectionId}`);
  if (payload.workerId) parts.push(`worker=${payload.workerId}`);
  if (payload.egressMode) parts.push(`network=${payload.egressMode}`);
  if (payload.sanitizedProxy) parts.push(`proxy=${payload.sanitizedProxy}`);
  if (payload.returnedModelCount != null) parts.push(`models=${payload.returnedModelCount}`);
  if (payload.durationMs != null) parts.push(`durationMs=${payload.durationMs}`);
  if (payload.status != null) parts.push(`status=${payload.status}`);
  if (payload.error) parts.push(`error=${sanitizeProviderLogText(payload.error)}`);
  if (payload.message) parts.push(sanitizeProviderLogText(payload.message));
  return parts.join(" ");
}

/**
 * @param {object} fields
 * @returns {{ requestId: string, startedAt: number, logTerminal: Function }}
 */
export function startProviderOperation(fields) {
  const requestId = fields.requestId || randomUUID();
  const startedAt = Date.now();
  const base = {
    ...fields,
    requestId,
    event: fields.event || "provider_request_started",
  };
  console.info(formatProviderLine(base));

  return {
    requestId,
    startedAt,
    logTerminal(outcome) {
      const terminal = {
        ...base,
        ...outcome,
        durationMs: outcome.durationMs ?? Date.now() - startedAt,
        requestId,
      };
      const level = outcome.level || (outcome.ok === false ? "error" : "info");
      const line = formatProviderLine(terminal);
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.info(line);
      return { requestId, ...terminal };
    },
  };
}

export function logModelListRequested(meta) {
  return startProviderOperation({ ...meta, operation: "model_list", event: "model_list_requested" });
}

export function logModelMetadataEnriched({ providerId, total, complete, partial, unknown }) {
  console.info(formatProviderLine({
    event: "model_metadata_enriched",
    operation: "model_list",
    providerId,
    message: `models=${total} complete=${complete} partial=${partial} unknown=${unknown}`,
  }));
}

export function logModelCatalogPersisted({ providerId, connectionId, modelCount, catalogKey }) {
  console.info(formatProviderLine({
    event: "model_catalog_persisted",
    operation: "model_list",
    providerId,
    connectionId,
    returnedModelCount: modelCount,
    message: catalogKey ? `catalogKey=${catalogKey}` : undefined,
  }));
}
