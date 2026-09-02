import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleComboChat } from "../../open-sse/services/combo.js";
import { HAI_CODES } from "../../open-sse/errors/index.js";
import { resetLanesForTests } from "../../open-sse/concurrency/index.js";
import { buildPublicErrorResponse, createInternalError } from "../../open-sse/errors/index.js";

const log = { info: vi.fn(), warn: vi.fn() };

function admissionErrorResponse(code) {
  return buildPublicErrorResponse(createInternalError({
    statusCode: 503,
    haiCode: code,
    origin: "admission",
    phase: "admission",
  }));
}

beforeEach(() => {
  resetLanesForTests({
    globalMax: 64,
    providerMax: 8,
    connectionMax: 4,
    queueMax: 128,
    queueTimeoutMs: 10_000,
    fusionMaxParallel: 3,
  });
  vi.clearAllMocks();
});

describe("combo — same-provider saturation carry-forward", () => {
  it("skips remaining same-provider models after admission queue timeout", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (_body, model) => {
      calls.push(model);
      if (model === "oc/model-1") {
        return admissionErrorResponse(HAI_CODES.queue_timeout);
      }
      return new Response("ok", { status: 200 });
    });

    const res = await handleComboChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["oc/model-1", "oc/model-2", "oc/model-3"],
      handleSingleModel,
      log,
    });

    expect(calls).toEqual(["oc/model-1"]);
    expect(res.status).toBe(503);
  });

  it("allows cross-provider fallback when first provider saturated", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (_body, model) => {
      calls.push(model);
      if (model === "oc/model-1") {
        return admissionErrorResponse(HAI_CODES.queue_timeout);
      }
      if (model === "openai/gpt-4o-mini") {
        return new Response("ok", { status: 200 });
      }
      return admissionErrorResponse(HAI_CODES.queue_timeout);
    });

    const res = await handleComboChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["oc/model-1", "openai/gpt-4o-mini"],
      handleSingleModel,
      log,
    });

    expect(calls).toEqual(["oc/model-1", "openai/gpt-4o-mini"]);
    expect(res.status).toBe(200);
  });
});
