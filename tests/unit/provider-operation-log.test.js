import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sanitizeProviderLogText,
  buildEgressLogFields,
  startProviderOperation,
} from "@/lib/providerOperationLog";

describe("providerOperationLog", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts secrets from log text", () => {
    const out = sanitizeProviderLogText("Authorization: Bearer sk-testsecret1234567890");
    expect(out).not.toContain("sk-testsecret1234567890");
    expect(out).toContain("[redacted]");
  });

  it("maps direct egress", () => {
    expect(buildEgressLogFields({})).toEqual({
      egressMode: "direct",
      proxyUsed: false,
      sanitizedProxy: null,
    });
  });

  it("maps proxied egress with sanitized url", () => {
    const fields = buildEgressLogFields({
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://user:PROXY_PASS_456@127.0.0.1:7890",
    });
    expect(fields.proxyUsed).toBe(true);
    expect(fields.egressMode).toBe("proxy");
    expect(fields.sanitizedProxy).not.toContain("PROXY_PASS_456");
  });

  it("logs start and terminal with same requestId", () => {
    const op = startProviderOperation({
      operation: "model_list",
      providerId: "openrouter",
      event: "model_list_requested",
    });
    op.logTerminal({ event: "model_list_succeeded", ok: true, returnedModelCount: 3 });
    expect(console.info).toHaveBeenCalled();
    const startLine = console.info.mock.calls[0][0];
    const endLine = console.info.mock.calls[1][0];
    expect(startLine).toMatch(/request=/);
    expect(endLine).toMatch(/model_list_succeeded/);
    expect(startLine).toContain(op.requestId);
    expect(endLine).toContain(op.requestId);
  });
});
