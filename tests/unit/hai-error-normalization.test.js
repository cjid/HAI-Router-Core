import { describe, it, expect, beforeEach } from "vitest";
import {
  createInternalError,
  normalizePublicError,
  buildPublicErrorResponse,
  buildSseErrorBytes,
  formatInternalErrorLog,
  redactSensitiveText,
  sanitizeUpstreamMessage,
  classifyUpstreamHttp,
  classifyTransportError,
  classifyAdmissionError,
  HAI_CODES,
  resetRequestIdCounterForTests,
} from "../../open-sse/errors/index.js";
import {
  errorResponse,
  createErrorResult,
  createUpstreamErrorResult,
  unavailableResponse,
  parseRetryAfterHeader,
} from "../../open-sse/utils/error.js";
import { buildAbortedResponsesTerminalBytes } from "../../open-sse/utils/responsesStreamHelpers.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { RateLimitCooldownError, SchedulerOverloadError } from "../../open-sse/concurrency/index.js";
import { admissionErrorResponse } from "../../src/sse/services/admissionErrors.js";
import { resetLanesForTests, admit, getSchedulerStats } from "../../open-sse/concurrency/index.js";

beforeEach(() => {
  resetRequestIdCounterForTests();
  resetLanesForTests({ globalMax: 5, providerMax: 5, connectionMax: 4, queueMax: 16, queueTimeoutMs: 5000 });
});

function parseJsonResponse(res) {
  return res.json();
}

describe("A — Raw provider message masking", () => {
  it("strips Anthropic and org identifiers from public message", async () => {
    const res = createUpstreamErrorResult(
      { statusCode: 429, message: "Anthropic API rate limit exceeded for org XYZ123", upstreamCode: "rate_limit" },
      { requestId: "hai_req_test_mask", provider: "anthropic", clientFormat: FORMATS.OPENAI },
    );
    const body = await parseJsonResponse(res.response);
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toContain("anthropic");
    expect(serialized).not.toContain("org xyz");
    expect(body.error.request_id).toBe("hai_req_test_mask");
    expect(body.error.code).toBe(HAI_CODES.rate_limited);
  });
});

describe("B — HTTP status preserved", () => {
  it.each([
    [429, HAI_CODES.rate_limited],
    [401, HAI_CODES.authentication_error],
    [502, HAI_CODES.upstream_error],
    [504, HAI_CODES.upstream_timeout],
  ])("status %i maps to hai code %s", async (status, code) => {
    const res = errorResponse(status, "ignored upstream text", { requestId: "hai_req_status" });
    expect(res.status).toBe(status);
    const body = await parseJsonResponse(res);
    expect(body.error.code).toBe(code);
  });
});

describe("C — Retry-After preserved", () => {
  it("429 includes Retry-After header and retry_after_ms", async () => {
    const res = createUpstreamErrorResult(
      { statusCode: 429, message: "rate limited", retryAfterMs: 4200 },
      { requestId: "hai_req_retry" },
    );
    expect(res.response.headers.get("Retry-After")).toBe("5");
    const body = await parseJsonResponse(res.response);
    expect(body.error.retry_after_ms).toBe(4200);
  });

  it("parseRetryAfterHeader handles delta seconds", () => {
    expect(parseRetryAfterHeader("5")).toEqual({ retryAfterMs: 5000, retryAfterSec: 5 });
  });
});

describe("D — OpenAI-compatible error", () => {
  it("includes message, type, code, param, request_id", async () => {
    const res = errorResponse(400, "bad", { requestId: "hai_req_oai" });
    const body = await parseJsonResponse(res);
    expect(body.error.message).toBeTruthy();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.code).toBe(HAI_CODES.invalid_request);
    expect(body.error.param).toBeNull();
    expect(body.error.request_id).toBe("hai_req_oai");
  });
});

describe("E — Anthropic-compatible error", () => {
  it("wraps in type:error envelope", () => {
    const internal = createInternalError({ requestId: "hai_req_claude", statusCode: 429, haiCode: HAI_CODES.rate_limited });
    const body = normalizePublicError(internal, { clientFormat: FORMATS.CLAUDE });
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("rate_limit_error");
    expect(body.error.request_id).toBe("hai_req_claude");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("anthropic");
  });
});

describe("F — SSE pre-stream error", () => {
  it("returns HTTP JSON error before stream starts", async () => {
    const res = createErrorResult(502, "upstream HTML body", null, {
      requestId: "hai_req_pre",
      phase: "stream_pre_pipe",
      haiCode: HAI_CODES.stream_error,
    });
    expect(res.response.headers.get("Content-Type")).toContain("application/json");
    const body = await parseJsonResponse(res.response);
    expect(body.error.code).toBe(HAI_CODES.stream_error);
  });
});

describe("G — SSE mid-stream error", () => {
  it("emits HAI-normalized SSE bytes", () => {
    const bytes = buildSseErrorBytes(
      createInternalError({ requestId: "hai_req_mid", statusCode: 502, haiCode: HAI_CODES.stream_error }),
      { clientFormat: FORMATS.OPENAI },
    );
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("data:");
    expect(text.toLowerCase()).not.toContain("anthropic");
    expect(text).toContain("hai_req_mid");
    expect(text).toContain(HAI_CODES.stream_error);
  });

  it("Responses API aborted terminal uses HAI codes", () => {
    const bytes = buildAbortedResponsesTerminalBytes({ requestId: "hai_req_resp" });
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("response.failed");
    expect(text).toContain(HAI_CODES.stream_error);
    expect(text.toLowerCase()).not.toContain("stream_disconnected");
  });
});

describe("H — Sensitive redaction", () => {
  it("redacts tokens, keys, proxy creds", () => {
    const raw = "Bearer sk-abc123 refresh_token=secret proxy://user:pass@1.2.3.4 Cookie: sess=1 Authorization: Bearer xyz";
    const out = redactSensitiveText(raw);
    expect(out.toLowerCase()).not.toContain("sk-abc");
    expect(out).not.toContain("refresh_token=secret");
    expect(out).not.toContain("user:pass");
    expect(out).not.toContain("Bearer xyz");
  });
});

describe("I — Provider request ID masking", () => {
  it("uses HAI request_id in public body", async () => {
    const res = createUpstreamErrorResult(
      { statusCode: 500, message: "req_abc123 failed at api.anthropic.com", upstreamCode: "req_abc123" },
      { requestId: "hai_req_public" },
    );
    const body = await parseJsonResponse(res.response);
    expect(body.error.request_id).toBe("hai_req_public");
    expect(JSON.stringify(body)).not.toContain("req_abc123");
  });
});

describe("J — Internal diagnostic correlation", () => {
  it("internal log retains provider and sanitized upstream message", () => {
    const internal = createInternalError({
      requestId: "hai_req_corr",
      statusCode: 429,
      upstreamMessage: "Anthropic rate limit org_abc",
      provider: "anthropic",
      connectionId: "conn-secret-id",
      upstreamCode: "rate_limit",
    });
    const logPayload = formatInternalErrorLog(internal);
    expect(logPayload.request_id).toBe("hai_req_corr");
    expect(logPayload.provider).toBe("anthropic");
    expect(logPayload.connection_id).toBe("conn-sec");
    expect(logPayload.upstream_message.toLowerCase()).not.toContain("anthropic");
  });
});

describe("K — Error classifier tests", () => {
  it("classifies rate limit vs transport vs admission", () => {
    expect(classifyUpstreamHttp(429).haiCode).toBe(HAI_CODES.rate_limited);
    expect(classifyTransportError(Object.assign(new Error("timeout"), { cause: { code: "ETIMEDOUT" } })).haiCode)
      .toBe(HAI_CODES.upstream_timeout);
    expect(classifyAdmissionError(new SchedulerOverloadError()).haiCode).toBe(HAI_CODES.capacity_exceeded);
    expect(classifyAdmissionError(new RateLimitCooldownError("x", 3000)).haiCode).toBe(HAI_CODES.rate_limited);
  });
});

describe("L — Concurrency regression", () => {
  it("admission error response does not leak permits", async () => {
    const ticket = await admit({ providerId: "openai", connectionId: "c1" });
    ticket.release();
    const stats = getSchedulerStats();
    expect(stats.lanes.global.active).toBe(0);
  });

  it("admission 429 uses HAI normalization", async () => {
    const res = admissionErrorResponse(new RateLimitCooldownError("cooldown", 2500), { requestId: "hai_req_adm" });
    expect(res.status).toBe(429);
    const body = await parseJsonResponse(res);
    expect(body.error.code).toBe(HAI_CODES.rate_limited);
    expect(body.error.request_id).toBe("hai_req_adm");
  });
});

describe("M — Unavailable response normalization", () => {
  it("includes type/code and Retry-After", async () => {
    const future = new Date(Date.now() + 5000).toISOString();
    const res = unavailableResponse(429, "all busy", future, "reset after 5s", { requestId: "hai_req_unavail" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const body = await parseJsonResponse(res);
    expect(body.error.code).toBe(HAI_CODES.rate_limited);
    expect(body.error.type).toBe("rate_limit_error");
  });
});

describe("Failure injection — public body never leaks provider names", () => {
  const cases = [
    { status: 400, msg: "OpenAI invalid model gpt-4" },
    { status: 401, msg: "Google API key invalid" },
    { status: 403, msg: "Anthropic permission denied" },
    { status: 429, msg: "xAI Grok rate limit" },
    { status: 500, msg: "Kiro internal error at aws.amazon.com" },
    { status: 502, msg: "Codex upstream failed" },
  ];

  it.each(cases)("status $status masks provider in public JSON", async ({ status, msg }) => {
    const res = createUpstreamErrorResult({ statusCode: status, message: msg }, { requestId: "hai_req_inj" });
    const body = await parseJsonResponse(res.response);
    const serialized = JSON.stringify(body).toLowerCase();
    for (const banned of ["openai", "anthropic", "google", "grok", "xai", "kiro", "codex", "amazonaws"]) {
      expect(serialized).not.toContain(banned);
    }
  });
});
