import { randomUUID } from "crypto";
import {
  getGoWorkerManager,
  getGoEngineManager,
} from "./goEngineManager.js";
import { isGoEngineEnabled } from "./workerManager.js";
import { logGoEngineEvent } from "./goEngineLogger.js";
import { buildEgressLogFields } from "@/lib/providerOperationLog.js";
import { originalFetch } from "../../../open-sse/utils/proxyFetch.js";
import {
  shouldBypassMitmDns,
  resolveRealIP,
  resolveConnectionProxyUrl,
} from "../../../open-sse/utils/proxyFetch.js";

const EXECUTE_PATH = "/v1/execute";

function headersToObject(headersInit) {
  if (!headersInit) return {};
  if (headersInit instanceof Headers) {
    return Object.fromEntries(headersInit.entries());
  }
  if (Array.isArray(headersInit)) {
    return Object.fromEntries(headersInit);
  }
  return { ...headersInit };
}

function resolveProxyFromOptions(targetUrl, proxyOptions) {
  if (!proxyOptions) return "";
  if (proxyOptions.proxyUrl) return String(proxyOptions.proxyUrl);
  const connectionProxy = resolveConnectionProxyUrl(targetUrl, proxyOptions);
  if (connectionProxy) return connectionProxy;
  if (Array.isArray(proxyOptions.proxies) && proxyOptions.proxies.length) {
    return String(proxyOptions.proxies[0]);
  }
  return "";
}

function wrapResponseBodyForLifecycle(response, onTerminal) {
  if (!response?.body) {
    onTerminal({ ok: true, reason: "no_body" });
    return response;
  }

  let terminalEmitted = false;
  const emitTerminal = (result) => {
    if (terminalEmitted) return;
    terminalEmitted = true;
    onTerminal(result);
  };

  const reader = response.body.getReader();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            emitTerminal({ ok: true, reason: "eof" });
            break;
          }
          controller.enqueue(value);
        }
      } catch (err) {
        emitTerminal({ ok: false, reason: "body_error", error: err });
        controller.error(err);
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => {});
      emitTerminal({ ok: false, reason: "cancelled", cancelReason: reason });
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export function isStrictGoEngineEnabled() {
  return isGoEngineEnabled();
}

export async function buildEgress(targetUrl, proxyOptions) {
  const generation = Number(proxyOptions?.egressGeneration ?? proxyOptions?.generation ?? 0);
  const identity = proxyOptions?.connectionId || proxyOptions?.identity || "";
  const strict = proxyOptions?.strictProxy === true;

  const vercelRelayUrl = String(proxyOptions?.vercelRelayUrl || "").trim();
  if (vercelRelayUrl) {
    return {
      mode: "relay",
      relayUrl: vercelRelayUrl,
      strict,
      identity,
      generation,
    };
  }

  const proxyUrl = resolveProxyFromOptions(targetUrl, proxyOptions);
  if (proxyUrl) {
    return {
      mode: "proxy",
      proxyUrl,
      strict,
      identity,
      generation,
    };
  }

  if (shouldBypassMitmDns(targetUrl)) {
    try {
      const hostname = new URL(targetUrl).hostname;
      const bypassIp = await resolveRealIP(hostname);
      if (bypassIp) {
        return {
          mode: "bypass",
          bypassHost: hostname,
          bypassIp,
          strict: false,
          identity,
          generation,
        };
      }
    } catch {
      // fall through to direct
    }
  }

  return {
    mode: "direct",
    strict: false,
    identity,
    generation,
  };
}

export function canUseGoEngineTransport(_proxyOptions) {
  return isGoEngineEnabled();
}

export async function goEngineFetch(url, options = {}, proxyOptions = null) {
  const engine = getGoEngineManager();
  engine.assertAdmission();

  const mgr = await getGoWorkerManager();
  if (!mgr) {
    const err = new Error("Go engine enabled but worker manager unavailable");
    err.code = "worker_unavailable";
    throw err;
  }

  const targetUrl = typeof url === "string" ? url : url.toString();
  const egress = await buildEgress(targetUrl, proxyOptions);
  const worker = engine.pickWorker({
    sessionId: proxyOptions?.sessionId,
    providerId: proxyOptions?.providerId,
    connectionId: proxyOptions?.connectionId,
    egressMode: egress.mode,
  });
  const requestId = proxyOptions?.requestId || randomUUID();
  const workerId = `worker-${worker.index}`;

  const method = (options.method || "GET").toUpperCase();
  const headers = headersToObject(options.headers);
  const body = typeof options.body === "string"
    ? options.body
    : options.body == null
      ? ""
      : JSON.stringify(options.body);

  const egressLog = buildEgressLogFields(proxyOptions, egress);
  const operation = proxyOptions?.operation || "provider_request";

  const spec = {
    requestId,
    providerId: proxyOptions?.providerId || proxyOptions?.provider || "unknown",
    connectionId: proxyOptions?.connectionId || "",
    method,
    url: targetUrl,
    headers,
    body,
    streamMode: (headers.Accept || "").includes("text/event-stream"),
    egress,
    timeoutMs: Number(proxyOptions?.timeoutMs || options.timeoutMs || 120000),
  };

  engine.trackRequest(requestId, {
    workerId,
    providerId: spec.providerId,
    connectionId: spec.connectionId,
  });

  logGoEngineEvent({
    level: "info",
    component: "GO:TRANSPORT",
    event: "provider_request_started",
    requestId,
    workerId,
    providerId: spec.providerId,
    connectionId: spec.connectionId,
    message: `${operation} ${method} ${new URL(targetUrl).host} network=${egressLog.egressMode}${egressLog.sanitizedProxy ? ` proxy=${egressLog.sanitizedProxy}` : ""}`,
  });

  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) controller.abort(options.signal.reason);
    else options.signal.addEventListener("abort", () => controller.abort(options.signal.reason), { once: true });
  }

  const started = Date.now();
  try {
    const res = await originalFetch(`${worker.baseUrl}${EXECUTE_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-HAI-Worker-Token": worker.authToken,
        "X-HAI-Request-Id": requestId,
      },
      body: JSON.stringify(spec),
      signal: controller.signal,
    });

    if (res.status === 401) {
      throw Object.assign(new Error("[GoEngine] worker auth failed"), { code: "worker_unavailable" });
    }

    const ct = res.headers.get("content-type") || "";
    if (!res.ok && ct.includes("application/json") && !res.headers.get("X-HAI-Transport-Protocol")) {
      const detail = await res.text().catch(() => "");
      throw Object.assign(new Error(`[GoEngine] ${res.status} ${detail.slice(0, 240)}`), { code: "transport_failed" });
    }

    const connectMs = res.headers.get("X-HAI-Transport-Connect-Ms");
    logGoEngineEvent({
      level: res.ok ? "info" : "warn",
      component: "GO:TRANSPORT",
      event: "provider_response_headers_received",
      requestId,
      workerId,
      providerId: spec.providerId,
      message: `${operation} status=${res.status} network=${egressLog.egressMode} connectMs=${connectMs || "?"} durationMs=${Date.now() - started}`,
    });

    if (!res.ok) {
      engine.completeRequest(requestId);
      logGoEngineEvent({
        level: "warn",
        component: "GO:TRANSPORT",
        event: "provider_request_failed",
        requestId,
        workerId,
        providerId: spec.providerId,
        message: `${operation} status=${res.status} network=${egressLog.egressMode}`,
      });
      return res;
    }

    return wrapResponseBodyForLifecycle(res, (terminal) => {
      engine.completeRequest(requestId);
      if (terminal.ok) {
        logGoEngineEvent({
          level: "info",
          component: "GO:TRANSPORT",
          event: "provider_request_succeeded",
          requestId,
          workerId,
          providerId: spec.providerId,
          message: `${operation} status=${res.status} network=${egressLog.egressMode} reason=${terminal.reason} durationMs=${Date.now() - started}`,
        });
        return;
      }

      const event = terminal.reason === "cancelled"
        ? "provider_request_cancelled"
        : "provider_request_failed";
      logGoEngineEvent({
        level: terminal.reason === "cancelled" ? "info" : "error",
        component: "GO:TRANSPORT",
        event,
        requestId,
        workerId,
        providerId: spec.providerId,
        message: `${operation} network=${egressLog.egressMode} reason=${terminal.reason}${terminal.error ? ` error=${terminal.error?.message || terminal.error}` : ""}`,
      });
    });
  } catch (err) {
    engine.completeRequest(requestId);
    logGoEngineEvent({
      level: "error",
      component: "GO:TRANSPORT",
      event: "provider_request_failed",
      requestId,
      workerId,
      providerId: spec.providerId,
      message: `${operation} network=${egressLog.egressMode} error=${err?.message || err}`,
    });
    throw err;
  }
}

export { isGoEngineEnabled, getGoWorkerManager, isStrictGoEngineEnabled as isStrictGoEngine };
