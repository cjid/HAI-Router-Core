import { describe, it, expect, vi, beforeEach } from "vitest";

const saveRequestDetailMock = vi.fn().mockResolvedValue(undefined);
const saveUsageStatsMock = vi.fn();

vi.mock("@/lib/usageDb.js", () => ({
  saveRequestDetail: (...args) => saveRequestDetailMock(...args),
  emitPendingStatsNow: vi.fn(),
}));

vi.mock("../../open-sse/handlers/chatCore/requestDetail.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    saveUsageStats: (...args) => saveUsageStatsMock(...args),
  };
});

const { buildOnStreamComplete } = await import("../../open-sse/handlers/chatCore/streamingHandler.js");

function makeStreamCompleteCtx(overrides = {}) {
  return buildOnStreamComplete({
    provider: "opencode",
    model: "mimo-v2.5-free",
    connectionId: "conn-stream-1",
    apiKey: "key-1",
    requestStartTime: Date.now() - 500,
    body: { messages: [{ role: "user", content: "hello" }], stream: true },
    stream: true,
    finalBody: { messages: [{ role: "user", content: "hello" }], stream: true },
    translatedBody: null,
    clientRawRequest: { endpoint: "/v1/chat/completions" },
    pxpipe: null,
    reqTag: "[TEST]",
    log: null,
    requestTiming: null,
    requestKind: null,
    proxyOptions: { providerId: "opencode", connectionId: "conn-stream-1" },
    ...overrides,
  });
}

beforeEach(() => {
  saveRequestDetailMock.mockClear();
  saveUsageStatsMock.mockClear();
});

describe("buildOnStreamComplete regression", () => {
  it("finalizes terminal detail without ReferenceError when provider usage is missing", () => {
    const { onStreamComplete, streamDetailId } = makeStreamCompleteCtx();

    expect(() => onStreamComplete(
      { content: "hello world", finishReason: "stop", hasToolCalls: false },
      null,
      Date.now() - 100,
      { kind: "complete", clientConnected: true, chunkCount: 4, totalBytes: 240 },
    )).not.toThrow();

    expect(saveRequestDetailMock).toHaveBeenCalledTimes(1);
    const [detail, options] = saveRequestDetailMock.mock.calls[0];
    expect(detail.id).toBe(streamDetailId);
    expect(detail.status).toBe("success");
    expect(detail.status).not.toBe("streaming");
    expect(options.immediate).toBe(true);
    expect(detail.network?.engine).toBe("go");
    expect(saveUsageStatsMock).toHaveBeenCalledTimes(1);
  });

  it("uses same stream detail id for terminal persistence", () => {
    const { onStreamComplete, streamDetailId } = makeStreamCompleteCtx();
    onStreamComplete(
      { content: "done", finishReason: "stop", hasToolCalls: false },
      { prompt_tokens: 12, completion_tokens: 3 },
      Date.now() - 50,
      { kind: "complete", clientConnected: true, hadProviderUsage: true },
    );
    expect(saveRequestDetailMock.mock.calls[0][0].id).toBe(streamDetailId);
  });
});
