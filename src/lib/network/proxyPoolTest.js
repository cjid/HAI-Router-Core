import { randomUUID } from "crypto";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";
import { canUseGoEngineTransport } from "@/lib/goEngine/goTransport.js";
import { redactProxyUrlForLog } from "@/lib/network/connectionProxy.js";
import { startProviderOperation } from "@/lib/providerOperationLog.js";

/** Relay pool types — share x-relay-target / x-relay-path contract via Go egress. */
export const RELAY_PROXY_TYPES = new Set(["vercel", "cloudflare", "deno"]);

/** Deterministic lightweight targets (no credentials, no LLM cost). */
export const PROXY_TEST_TARGET = Object.freeze({
  relay: "https://httpbin.org/get",
  http: "https://www.google.com/generate_204",
});

const DEFAULT_TIMEOUT_MS = 10000;

export function isRelayProxyType(type) {
  return RELAY_PROXY_TYPES.has(type || "http");
}

function parseConnectMs(res) {
  const raw = res?.headers?.get?.("X-HAI-Transport-Connect-Ms");
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

async function validateRelayResponse(res) {
  if (res.status !== 200) {
    return {
      valid: false,
      error: `Relay target returned HTTP ${res.status}`,
    };
  }
  try {
    const data = await res.json();
    if (data?.url && String(data.url).includes("httpbin.org")) {
      return { valid: true };
    }
    return { valid: false, error: "Relay response did not match httpbin contract" };
  } catch {
    return { valid: false, error: "Relay response was not valid JSON" };
  }
}

function validateHttpProxyResponse(res) {
  const status = res.status;
  if (status >= 200 && status < 600) {
    return { valid: true };
  }
  return { valid: false, error: `Unexpected HTTP status ${status}` };
}

/**
 * Type-aware proxy pool health test via Go Engine egress (same path as provider traffic).
 */
export async function testProxyPoolEntry({
  proxyPool,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  testUrlOverride,
} = {}) {
  if (!proxyPool?.proxyUrl) {
    return {
      ok: false,
      errorCode: "invalid_input",
      errorMessage: "proxyUrl is required",
      latencyMs: null,
    };
  }

  const proxyId = proxyPool.id || "unknown";
  const proxyType = proxyPool.type || "http";
  const proxyUrl = String(proxyPool.proxyUrl).trim();
  const requestId = randomUUID();
  const startedAt = Date.now();
  const relay = isRelayProxyType(proxyType);

  const log = startProviderOperation({
    requestId,
    operation: "proxy_test",
    event: "proxy_test_started",
    providerId: "proxy-test",
    egressMode: relay ? "relay" : "proxy",
    sanitizedProxy: redactProxyUrlForLog(proxyUrl),
    message: `proxyId=${proxyId} type=${proxyType}`,
  });

  if (!canUseGoEngineTransport()) {
    const errorMessage = "Go engine is required for proxy testing";
    log.logTerminal({
      event: "proxy_test_failed",
      ok: false,
      level: "error",
      error: errorMessage,
    });
    return buildResult({
      ok: false,
      proxyId,
      proxyType,
      requestId,
      startedAt,
      egressMode: relay ? "relay" : "proxy",
      errorCode: "engine_unavailable",
      errorMessage,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const targetUrl = testUrlOverride?.trim()
      || (relay ? PROXY_TEST_TARGET.relay : PROXY_TEST_TARGET.http);

    const proxyOptions = relay
      ? {
        providerId: "proxy-test",
        vercelRelayUrl: proxyUrl,
        strictProxy: true,
        requestId,
        operation: "proxy_test",
        timeoutMs,
      }
      : {
        providerId: "proxy-test",
        connectionProxyUrl: proxyUrl,
        connectionProxyEnabled: true,
        strictProxy: proxyPool.strictProxy === true,
        requestId,
        operation: "proxy_test",
        timeoutMs,
      };

    const res = await proxyAwareFetch(targetUrl, {
      method: relay ? "GET" : "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "HAI-Router-ProxyTest/1.0" },
    }, proxyOptions);

    const connectMs = parseConnectMs(res);
    const roundTripMs = Date.now() - startedAt;
    const latencyMs = connectMs ?? roundTripMs;
    const statusCode = res.status;

    const validation = relay
      ? await validateRelayResponse(res)
      : validateHttpProxyResponse(res);

    const ok = validation.valid === true;
    const result = buildResult({
      ok,
      proxyId,
      proxyType,
      requestId,
      startedAt,
      egressMode: relay ? "relay" : "proxy",
      latencyMs: ok ? latencyMs : null,
      failedAfterMs: ok ? null : roundTripMs,
      statusCode,
      connectMs,
      errorCode: ok ? null : "validation_failed",
      errorMessage: ok ? null : validation.error,
    });

    log.logTerminal({
      event: ok ? "proxy_test_succeeded" : "proxy_test_failed",
      ok,
      level: ok ? "info" : "warn",
      egressMode: result.egressMode,
      status: statusCode,
      message: ok ? `latencyMs=${result.latencyMs}` : result.errorMessage,
      durationMs: result.elapsedMs,
    });

    return result;
  } catch (err) {
    const isTimeout = err?.name === "AbortError";
    const errorMessage = isTimeout
      ? "Proxy test timed out"
      : (err?.message || String(err));
    const errorCode = isTimeout ? "timeout" : (err?.code || "transport_failed");

    log.logTerminal({
      event: isTimeout ? "proxy_test_timeout" : "proxy_test_failed",
      ok: false,
      level: "error",
      error: errorMessage,
      durationMs: Date.now() - startedAt,
    });

    return buildResult({
      ok: false,
      proxyId,
      proxyType,
      requestId,
      startedAt,
      egressMode: relay ? "relay" : "proxy",
      failedAfterMs: Date.now() - startedAt,
      errorCode,
      errorMessage,
    });
  } finally {
    clearTimeout(timer);
  }
}

function buildResult(fields) {
  const testedAt = new Date().toISOString();
  const elapsedMs = Date.now() - (fields.startedAt ?? Date.now());
  return {
    ok: fields.ok === true,
    proxyId: fields.proxyId,
    proxyType: fields.proxyType,
    testedAt,
    latencyMs: fields.latencyMs ?? null,
    failedAfterMs: fields.failedAfterMs ?? null,
    statusCode: fields.statusCode ?? null,
    egressMode: fields.egressMode ?? null,
    errorCode: fields.errorCode ?? null,
    errorMessage: fields.errorMessage ?? null,
    requestId: fields.requestId,
    connectMs: fields.connectMs ?? null,
    elapsedMs,
  };
}
