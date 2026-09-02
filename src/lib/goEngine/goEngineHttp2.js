import { randomUUID } from "crypto";
import { getGoEngineManager, getGoWorkerManager, isGoEngineEnabled } from "./goEngineManager.js";
import { logGoEngineEvent } from "./goEngineLogger.js";
import { originalFetch } from "../../../open-sse/utils/proxyFetch.js";
import { buildEgress } from "./goTransport.js";

/**
 * Open a bidirectional HTTP/2 stream via Go worker (Cursor AgentService).
 * Node owns protobuf semantics; Go owns TLS/HTTP/2/proxy.
 */
export async function goEngineOpenHttp2Stream(url, headers, signal, proxyOptions = null) {
  if (!isGoEngineEnabled()) {
    throw new Error("Go engine required for HTTP/2 provider transport");
  }

  const engine = getGoEngineManager();
  engine.assertAdmission();
  const mgr = await getGoWorkerManager();
  const egress = await buildEgress(url, proxyOptions);
  const worker = engine.pickWorker({
    sessionId: proxyOptions?.sessionId,
    providerId: proxyOptions?.providerId,
    connectionId: proxyOptions?.connectionId,
    egressMode: egress.mode,
  });
  const requestId = proxyOptions?.requestId || randomUUID();
  const workerId = `worker-${worker.index}`;

  engine.trackRequest(requestId, {
    workerId,
    providerId: proxyOptions?.providerId,
    connectionId: proxyOptions?.connectionId,
  });

  logGoEngineEvent({
    level: "info",
    component: "GO:HTTP2",
    event: "stream_started",
    requestId,
    workerId,
    message: new URL(url).host,
  });

  const openRes = await originalFetch(`${worker.baseUrl}/v1/h2/open`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-HAI-Worker-Token": worker.authToken,
      "X-HAI-Request-Id": requestId,
    },
    body: JSON.stringify({
      requestId,
      url,
      headers,
      egress,
    }),
    signal,
  });

  if (!openRes.ok) {
    engine.completeRequest(requestId);
    const detail = await openRes.text().catch(() => "");
    throw new Error(`Go HTTP/2 open failed: ${openRes.status} ${detail.slice(0, 200)}`);
  }

  const { streamId } = await openRes.json();
  const chunkQueue = [];
  let responseHeadersResolve = null;
  let responseHeadersReject = null;
  let responseHeadersSettled = false;
  let ended = false;
  let streamError = null;
  let waiting = null;

  const responseHeaders = new Promise((resolve, reject) => {
    responseHeadersResolve = resolve;
    responseHeadersReject = reject;
  });

  const wake = (result) => {
    if (!waiting) return;
    const fn = waiting;
    waiting = null;
    fn(result);
  };

  const eventsController = new AbortController();
  if (signal) {
    if (signal.aborted) eventsController.abort(signal.reason);
    else signal.addEventListener("abort", () => eventsController.abort(signal.reason), { once: true });
  }

  const eventsPromise = (async () => {
    const res = await originalFetch(`${worker.baseUrl}/v1/h2/${streamId}/events`, {
      headers: { "X-HAI-Worker-Token": worker.authToken },
      signal: eventsController.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`Go HTTP/2 events failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const event = JSON.parse(line.slice(6));
        if (event.type === "response" && !responseHeadersSettled) {
          responseHeadersSettled = true;
          responseHeadersResolve(event.headers);
        } else if (event.type === "data") {
          const chunk = Buffer.from(event.b64, "base64");
          if (waiting) wake({ value: chunk, done: false });
          else chunkQueue.push(chunk);
        } else if (event.type === "error") {
          streamError = new Error(event.message || "HTTP/2 stream error");
          if (!responseHeadersSettled) responseHeadersReject(streamError);
          ended = true;
          wake(null);
        } else if (event.type === "end") {
          ended = true;
          wake(null);
        }
      }
    }
    ended = true;
    wake(null);
  })().catch((err) => {
    streamError = err;
    if (!responseHeadersSettled) responseHeadersReject(err);
    ended = true;
    wake(null);
  });

  const close = async () => {
    eventsController.abort();
    try {
      await originalFetch(`${worker.baseUrl}/v1/h2/${streamId}/close`, {
        method: "POST",
        headers: { "X-HAI-Worker-Token": worker.authToken },
      });
    } catch { /* ignore */ }
    engine.completeRequest(requestId);
    logGoEngineEvent({
      level: "info",
      component: "GO:HTTP2",
      event: "stream_completed",
      requestId,
      workerId,
    });
  };

  return {
    responseHeaders,
    async write(frame) {
      await originalFetch(`${worker.baseUrl}/v1/h2/${streamId}/write`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-HAI-Worker-Token": worker.authToken,
        },
        body: Buffer.from(frame),
      });
    },
    end() {
      return originalFetch(`${worker.baseUrl}/v1/h2/${streamId}/close`, {
        method: "POST",
        headers: { "X-HAI-Worker-Token": worker.authToken },
      }).catch(() => {});
    },
    close,
    async read() {
      if (chunkQueue.length) return { value: chunkQueue.shift(), done: false };
      if (ended) {
        if (streamError) throw streamError;
        await eventsPromise.catch(() => {});
        return { value: undefined, done: true };
      }
      const result = await new Promise((resolve) => { waiting = resolve; });
      if (streamError) throw streamError;
      return result || { value: undefined, done: true };
    },
  };
}
