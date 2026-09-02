// Stream handler with disconnect detection - shared for all providers
import { STREAM_STALL_TIMEOUT_MS } from "../config/runtimeConfig.js";
import { computeFirstByteTimeoutMs } from "../latency/adaptiveTimeout.js";
import { dbg, isDebugEnabled } from "./debugLog.js";

// Get HH:MM:SS timestamp
function getTimeString() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Create stream controller with abort and disconnect detection
 * @param {object} options
 * @param {function} options.onDisconnect - Callback when client disconnects
 * @param {object} options.log - Logger instance
 * @param {string} options.provider - Provider name
 * @param {string} options.model - Model name
 */
export function createStreamController({ onDisconnect, onError, onComplete, log, provider, model, reqTag = "", parentSignal = null } = {}) {
  const abortController = new AbortController();
  const startTime = Date.now();
  let disconnected = false;
  let abortTimeout = null;

  // Only abnormal terminations are logged; normal completion is covered by "📊 done".
  // isError uses errorLine (always shown, ignores LOG_LEVEL) so failures survive quiet levels.
  const logStream = (symbol, status, isError = false) => {
    const duration = Date.now() - startTime;
    const emit = isError ? log?.errorLine : log?.line;
    if (emit) emit(reqTag, symbol, `${status} · ${provider}/${model} · ${duration}ms`);
    else console.log(`[${getTimeString()}] ${symbol} ${provider}/${model} · ${status} · ${duration}ms`);
  };

  const ctrl = {
    signal: abortController.signal,
    startTime,

    isConnected: () => !disconnected,

    // Call when client disconnects
    handleDisconnect: (reason = "client_closed") => {
      if (disconnected) return;
      disconnected = true;

      // Debug-only: Responses API has no [DONE] sentinel, so codex/droid close the
      // socket on every completed request. "📊 done" is the authoritative outcome line.
      dbg("CTRL", `${provider}/${model} | disconnect=${reason} | dur=${Date.now() - startTime}ms`);

      // Delay abort to allow cleanup
      abortTimeout = setTimeout(() => {
        abortController.abort();
      }, 500);

      onDisconnect?.({ reason, duration: Date.now() - startTime });
    },

    // Call when stream completes normally (no line here — "📊 done" is authoritative)
    handleComplete: () => {
      if (disconnected) return;
      disconnected = true;

      if (abortTimeout) {
        clearTimeout(abortTimeout);
        abortTimeout = null;
      }

      onComplete?.();
    },

    // Call on error
    handleError: (error) => {
      if (disconnected) return;
      disconnected = true;

      if (abortTimeout) {
        clearTimeout(abortTimeout);
        abortTimeout = null;
      }

      if (error.name === "AbortError") {
        logStream("⚡", "ABORTED");
        return;
      }

      logStream("✗", `ERROR: ${error.message}${error.stack ? `\n    ${error.stack}` : ""}`, true);
      onError?.(error);
    },

    abort: () => abortController.abort(),
  };

  // Route request.signal through handleDisconnect so the disconnected latch is set
  // before abortController fires — prevents spurious ResponseAborted on normal SSE teardown.
  if (parentSignal) {
    const onParentAbort = () => {
      ctrl.handleDisconnect("client_closed");
    };
    if (parentSignal.aborted) onParentAbort();
    else parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  return ctrl;
}

/**
 * Create transform stream with disconnect detection
 * Wraps existing transform stream and adds abort capability.
 *
 * Stall detection lives in pipeWithDisconnect (tied to upstream byte
 * activity), not here — output of the transform stream may be silent
 * for long periods while raw bytes still flow (e.g. Kiro EventStream
 * binary frames buffering, Claude reasoning streams).
 */
export function createDisconnectAwareStream(transformStream, streamController, onAbortTerminal = null) {
  const reader = transformStream.readable.getReader();
  const writer = transformStream.writable.getWriter();
  let terminalEmitted = false;

  // Emit a synthesized terminal payload (e.g. Responses response.failed + [DONE]) once
  const emitTerminal = (controller) => {
    if (terminalEmitted || !onAbortTerminal) return;
    terminalEmitted = true;
    try {
      const bytes = onAbortTerminal();
      if (bytes) controller.enqueue(bytes);
    } catch { /* best-effort terminal */ }
  };

  return new ReadableStream({
    async pull(controller) {
      if (!streamController.isConnected()) {
        emitTerminal(controller);
        controller.close();
        return;
      }

      try {
        const { done, value } = await reader.read();

        if (done) {
          streamController.handleComplete();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        const wasConnected = streamController.isConnected();
        // Controller already closed = downstream ended; not an upstream error, skip noisy log.
        const msg0 = error?.message || "";
        const isControllerClosed = msg0.includes("already closed") || msg0.includes("Invalid state");
        if (!isControllerClosed) streamController.handleError(error);
        reader.cancel().catch(() => {});
        writer.abort().catch(() => {});

        // Treat network resets / socket hang up / abort as graceful close
        const msg = error?.message || "";
        const code = error?.code || error?.cause?.code || "";
        const isNetworkClose =
          error.name === "AbortError" ||
          msg.includes("aborted") ||
          msg.includes("socket hang up") ||
          msg.includes("ECONNRESET") ||
          msg.includes("ETIMEDOUT") ||
          msg.includes("EPIPE") ||
          code === "ECONNRESET" ||
          code === "ETIMEDOUT" ||
          code === "EPIPE" ||
          code === "UND_ERR_SOCKET";

        // Graceful close on network/abort, or when a structured terminal is available
        // (Responses passthrough prefers response.failed + [DONE] over a raw transport error)
        try {
          if (!wasConnected || isNetworkClose || onAbortTerminal) {
            emitTerminal(controller);
            controller.close();
          } else {
            controller.error(error);
          }
        } catch (e) { /* already closed or cancelled */ }
      }
    },

    cancel(reason) {
      streamController.handleDisconnect(reason || "cancelled");
      reader.cancel();
      writer.abort();
    }
  });
}

/**
 * Pipe provider response through transform with disconnect detection.
 *
 * Stall watchdog tracks raw upstream byte activity, not transform output.
 * Reasoning models (Claude thinking via Kiro, etc.) can produce zero SSE
 * output for long stretches while partial EventStream frames keep arriving.
 * Measuring stall on the transform output caused false stalls and the
 * "failed to pipe response" error in Next.
 *
 * Any upstream chunk resets the timer. If no bytes arrive for
 * STREAM_STALL_TIMEOUT_MS, abort the underlying fetch via the controller.
 *
 * @param {Response} providerResponse - Response from provider
 * @param {TransformStream} transformStream - Transform stream for SSE
 * @param {object} streamController - Stream controller from createStreamController
 */
export function pipeWithDisconnect(providerResponse, transformStream, streamController, onAbortTerminal = null, stallTimeoutMs = STREAM_STALL_TIMEOUT_MS, onUpstreamChunk = null, streamState = null, requestTiming = null, firstByteTimeoutMs = null, finalizeStreamFn = null) {
  let stallTimer = null;
  let firstByteTimer = null;
  let chunkCount = 0;
  let totalBytes = 0;
  let lastChunkAt = Date.now();
  let upstreamEof = false;
  let terminalKind = null;
  const t0 = Date.now();
  const tag = "STREAM";
  const clearStall = () => {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
  };
  const clearFirstByte = () => {
    if (firstByteTimer) { clearTimeout(firstByteTimer); firstByteTimer = null; }
  };

  const doFinalize = typeof finalizeStreamFn === "function"
    ? finalizeStreamFn
    : (typeof transformStream?.finalize === "function" ? (ctx) => transformStream.finalize(ctx) : null);

  // Wrap controller so every termination path clears the stall timer and
  // finalizes partial usage before stream state is torn down.
  const invokeStreamTerminal = (kind, extra = {}) => {
    // Normal SSE teardown: client closes after upstream EOF → ignore late ResponseAborted.
    if (
      terminalKind === "complete"
      && kind === "disconnect"
      && String(extra.reason || "").toLowerCase().includes("responseaborted")
    ) {
      return;
    }
    if (terminalKind && kind === "disconnect" && terminalKind === "disconnect") return;

    const ctx = {
      kind,
      chunkCount,
      totalBytes,
      durationMs: Date.now() - t0,
      lastChunkAgeMs: Date.now() - lastChunkAt,
      streamStarted: chunkCount > 0,
      upstreamEof,
      clientConnected: streamController.isConnected?.() ?? true,
      ...extra,
    };
    if (!doFinalize) return;
    try {
      doFinalize(ctx);
      terminalKind = kind;
    } catch (e) {
      dbg(tag, `terminal finalize failed: ${e?.message}`);
    }
  };

  const wrappedController = {
    signal: streamController.signal,
    startTime: streamController.startTime,
    isConnected: () => streamController.isConnected(),
    handleComplete: () => {
      invokeStreamTerminal("complete", { clientConnected: streamController.isConnected?.() ?? true });
      dbg(tag, `complete | chunks=${chunkCount} | bytes=${totalBytes} | dur=${Date.now() - t0}ms`);
      if (isDebugEnabled && chunkCount > 1) {
        dbg(tag, `STREAM QUALITY | chunks=${chunkCount} | bytes=${totalBytes} | durMs=${Date.now() - t0}`);
      }
      clearStall(); clearFirstByte(); streamController.handleComplete();
    },
    handleError: (e) => {
      invokeStreamTerminal("error", { error: e, clientConnected: streamController.isConnected?.() ?? true });
      dbg(tag, `error: ${e?.message} | chunks=${chunkCount} | bytes=${totalBytes} | dur=${Date.now() - t0}ms`);
      clearStall(); clearFirstByte(); streamController.handleError(e);
    },
    handleDisconnect: (r) => {
      if (!streamController.isConnected()) return;
      invokeStreamTerminal("disconnect", { reason: r, clientConnected: false });
      dbg(tag, `disconnect: ${r} | chunks=${chunkCount} | bytes=${totalBytes} | dur=${Date.now() - t0}ms`);
      clearStall(); clearFirstByte(); streamController.handleDisconnect(r);
    },
    abort: () => { clearStall(); clearFirstByte(); streamController.abort(); }
  };

  if (streamController.signal) {
    streamController.signal.addEventListener("abort", () => {
      if (streamController.isConnected?.()) {
        wrappedController.handleDisconnect("ResponseAborted");
      }
    }, { once: true });
  }

  const armStall = () => {
    clearStall();
    stallTimer = setTimeout(() => {
      stallTimer = null;
      dbg(tag, `STALL TIMEOUT ${stallTimeoutMs}ms | chunks=${chunkCount} | bytes=${totalBytes} | sinceLast=${Date.now() - lastChunkAt}ms`);
      wrappedController.handleError?.(new Error("stream stall timeout"));
      wrappedController.abort?.();
    }, stallTimeoutMs);
  };

  const fbTimeout = firstByteTimeoutMs ?? null;
  if (fbTimeout > 0) {
    firstByteTimer = setTimeout(() => {
      if (chunkCount === 0) {
        dbg(tag, `FIRST BYTE TIMEOUT ${fbTimeout}ms | no upstream bytes`);
        wrappedController.handleError?.(new Error("first byte timeout"));
        wrappedController.abort?.();
      }
    }, fbTimeout);
  }

  armStall();
  dbg(tag, `pipe start | stallTimeout=${stallTimeoutMs}ms`);

  const upstreamTap = new TransformStream({
    transform(chunk, controller) {
      chunkCount++;
      const sz = chunk?.byteLength || chunk?.length || 0;
      totalBytes += sz;
      const now = Date.now();
      const gap = now - lastChunkAt;
      lastChunkAt = now;
      if (isDebugEnabled && (chunkCount <= 5 || chunkCount % 20 === 0 || gap > 5000)) {
        dbg(tag, `chunk #${chunkCount} | size=${sz}B | gap=${gap}ms | total=${totalBytes}B`);
      }
      if (chunkCount === 1) {
        if (streamState) streamState.started = true;
        clearFirstByte();
        requestTiming?.markUpstreamFirstByte?.(now);
      }
      if (chunkCount === 1 || chunkCount % 15 === 0) {
        try { onUpstreamChunk?.(chunkCount); } catch { /* topology heartbeat must not break stream */ }
      }
      armStall();
      controller.enqueue(chunk);
    },
    flush() {
      upstreamEof = true;
      dbg(tag, `upstream EOF | chunks=${chunkCount} | bytes=${totalBytes} | dur=${Date.now() - t0}ms`);
      clearStall(); clearFirstByte();
    }
  });

  const transformedBody = providerResponse.body
    .pipeThrough(upstreamTap)
    .pipeThrough(transformStream);

  return createDisconnectAwareStream(
    { readable: transformedBody, writable: { getWriter: () => ({ abort: () => Promise.resolve() }) } },
    wrappedController,
    onAbortTerminal
  );
}

