import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCursorModelCache,
  parseCursorUsableModels,
  resolveCursorModels,
} from "../../open-sse/services/cursorModels.js";

function varint(value) {
  const bytes = [];
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return Uint8Array.from(bytes);
}

function field(fieldNumber, value) {
  return Uint8Array.from([(fieldNumber << 3) | 2, ...varint(value.length), ...value]);
}

function text(value) {
  return new TextEncoder().encode(value);
}

function concat(...parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function model(id, name) {
  return field(1, concat(field(1, text(id)), field(4, text(name))));
}

function createMockHttp2Client(body, status = 200) {
  return {
    on() {},
    close() {},
    request() {
      const req = {
        on(event, cb) {
          if (event === "response") queueMicrotask(() => cb({ ":status": status }));
          if (event === "data") queueMicrotask(() => cb(Buffer.from(body)));
          if (event === "end") queueMicrotask(() => cb());
          if (event === "error") this._errorCb = cb;
        },
        end() {},
        write() {},
      };
      return req;
    },
  };
}

let mockClientBody = new Uint8Array();
let mockClientStatus = 200;

vi.mock("../../open-sse/utils/http2Connect.js", () => ({
  isProxyConfigured: vi.fn(() => false),
  connectHttp2Client: vi.fn(async () => createMockHttp2Client(mockClientBody, mockClientStatus)),
}));

describe("Cursor live model catalog", () => {
  beforeEach(() => {
    clearCursorModelCache();
    mockClientStatus = 200;
  });

  afterEach(() => {
    clearCursorModelCache();
  });

  it("decodes the GetUsableModels protobuf response", () => {
    const payload = concat(
      model("default", "Auto"),
      model("gpt-5.3-codex", "GPT 5.3 Codex"),
      model("gpt-5.3-codex", "Duplicate"),
    );

    expect(parseCursorUsableModels(payload)).toEqual([
      { id: "default", name: "Auto" },
      { id: "gpt-5.3-codex", name: "GPT 5.3 Codex" },
    ]);
  });

  it("fetches the account-specific catalog and caches it", async () => {
    mockClientBody = concat(model("claude-4.6-opus", "Claude 4.6 Opus"));
    const credentials = {
      accessToken: "cursor-token",
      providerSpecificData: { machineId: "machine-id" },
    };

    await expect(resolveCursorModels(credentials)).resolves.toEqual({
      models: [{ id: "claude-4.6-opus", name: "Claude 4.6 Opus" }],
    });
    await expect(resolveCursorModels(credentials)).resolves.toEqual({
      models: [{ id: "claude-4.6-opus", name: "Claude 4.6 Opus" }],
    });
  });

  it("fails open when the Cursor catalog request fails", async () => {
    mockClientStatus = 403;
    mockClientBody = new Uint8Array();

    await expect(resolveCursorModels({
      accessToken: "cursor-token",
      providerSpecificData: { machineId: "machine-id" },
    })).resolves.toBeNull();
  });
});
