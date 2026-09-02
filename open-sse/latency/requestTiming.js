/**
 * Lightweight per-request timing checkpoints for latency telemetry.
 */

export function createRequestTiming(requestStartMs = Date.now()) {
  const marks = { request_start: requestStartMs };

  return {
    requestStartMs,
    marks,
    ttfbAt: null,
    ttftAt: null,
    upstreamDispatchAt: null,

    mark(name, ts = Date.now()) {
      marks[name] = ts;
    },

    markUpstreamDispatch(ts = Date.now()) {
      this.upstreamDispatchAt = ts;
      marks.upstream_dispatch = ts;
    },

    markUpstreamFirstByte(ts = Date.now()) {
      if (!this.ttfbAt) {
        this.ttfbAt = ts;
        marks.upstream_first_byte = ts;
      }
    },

    markClientFirstToken(ts = Date.now()) {
      if (!this.ttftAt) {
        this.ttftAt = ts;
        marks.client_first_token = ts;
      }
    },

    phases() {
      const m = marks;
      const diff = (a, b) => (m[a] != null && m[b] != null ? m[b] - m[a] : null);
      return {
        queue_wait_ms: diff("request_start", "admission_done"),
        routing_ms: diff("admission_done", "routing_done"),
        pre_upstream_ms: diff("routing_done", "upstream_dispatch"),
        upstream_connect_ms: diff("upstream_dispatch", "upstream_first_byte"),
        time_to_first_byte_ms: m.upstream_first_byte != null ? m.upstream_first_byte - m.request_start : null,
        time_to_first_token_ms: m.client_first_token != null ? m.client_first_token - m.request_start : null,
        stream_setup_ms: diff("upstream_first_byte", "client_first_token"),
        total_ms: Date.now() - m.request_start,
      };
    },

    toLatencyRecord() {
      const p = this.phases();
      return {
        ttft: p.time_to_first_token_ms ?? p.time_to_first_byte_ms ?? p.total_ms ?? 0,
        total: p.total_ms ?? 0,
        phases: p,
      };
    },
  };
}
