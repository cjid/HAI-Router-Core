import { isTerminalRequestStatus } from "./asyncFetch.js";

/** SQLite busy_timeout is 5s — allow headroom for API + serialization. */
export const REQUEST_DETAIL_FETCH_TIMEOUT_MS = 15_000;

export const TERMINAL_DETAIL_CACHE_MAX = 24;

/**
 * Independent detail-fetch identity — never derived from selectedDetail render state.
 */
export function createDetailRequestTracker() {
  let generation = 0;
  let activeId = null;
  let abortController = null;

  return {
    getActiveId() {
      return activeId;
    },

    getGeneration() {
      return generation;
    },

    /** Abort prior fetch, bump generation, return capture for stale guards. */
    startRequest(id) {
      if (!id) throw new Error("detail id required");
      abortController?.abort();
      generation += 1;
      activeId = id;
      abortController = new AbortController();
      const captured = { generation, id };
      return {
        ...captured,
        signal: abortController.signal,
        isCurrent: () => generation === captured.generation && activeId === captured.id,
      };
    },

    cancelActive() {
      abortController?.abort();
      abortController = null;
      activeId = null;
      generation += 1;
    },

    isCurrent({ generation: gen, id }) {
      return gen === generation && id === activeId;
    },
  };
}

export function linkAbortSignals(...signals) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

export class RequestDetailFetchError extends Error {
  constructor(message, { cause, timedOut = false, status, aborted = false } = {}) {
    super(message);
    this.name = "RequestDetailFetchError";
    this.timedOut = timedOut;
    this.status = status;
    this.aborted = aborted;
    this.cause = cause;
  }
}

export async function fetchRequestDetailById(
  id,
  { signal, timeoutMs = REQUEST_DETAIL_FETCH_TIMEOUT_MS, fetchFn = fetch } = {},
) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  const linked = linkAbortSignals(signal, timeoutController.signal);

  try {
    const res = await fetchFn(
      `/api/usage/request-details/${encodeURIComponent(id)}`,
      { signal: linked },
    );
    if (!res.ok) {
      throw new RequestDetailFetchError(`HTTP ${res.status}`, { status: res.status });
    }
    const data = await res.json();
    return data.detail ?? null;
  } catch (err) {
    if (err instanceof RequestDetailFetchError) throw err;
    if (linked.aborted) {
      if (signal?.aborted) {
        throw new RequestDetailFetchError("Request detail fetch aborted", { aborted: true, cause: err });
      }
      if (timeoutController.signal.aborted) {
        throw new RequestDetailFetchError("Request detail fetch timed out", { timedOut: true, cause: err });
      }
      throw new RequestDetailFetchError("Request detail fetch aborted", { aborted: true, cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Bounded session cache for terminal full-detail records. */
export function createTerminalDetailCache(maxSize = TERMINAL_DETAIL_CACHE_MAX) {
  const map = new Map();
  return {
    get(id) {
      return map.get(id) ?? null;
    },
    set(detail) {
      if (!detail?.id || !isTerminalRequestStatus(detail.status)) return;
      if (map.has(detail.id)) map.delete(detail.id);
      map.set(detail.id, detail);
      while (map.size > maxSize) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
      }
    },
    clear() {
      map.clear();
    },
    size() {
      return map.size;
    },
  };
}

export function detailHasFullPayload(detail) {
  if (!detail) return false;
  const payloadKeys = ["request", "providerRequest", "providerResponse", "response"];
  return payloadKeys.some((key) => {
    const value = detail[key];
    if (value == null) return false;
    if (typeof value === "object" && value.redacted === true) return false;
    return true;
  });
}
