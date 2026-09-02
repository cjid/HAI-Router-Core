import { describe, it, expect } from "vitest";
import {
  mergeRequestDetailMonotonic,
  isTerminalRequestDetailStatus,
} from "@/lib/db/repos/requestDetailsRepo.js";

describe("request detail monotonic state", () => {
  it("recognizes terminal statuses", () => {
    expect(isTerminalRequestDetailStatus("success")).toBe(true);
    expect(isTerminalRequestDetailStatus("partial")).toBe(true);
    expect(isTerminalRequestDetailStatus("streaming")).toBe(false);
  });

  it("rejects stale streaming write after terminal success", () => {
    const terminal = {
      id: "req-1",
      status: "success",
      response: { finish_reason: "stop", type: "streaming" },
      tokens: { prompt_tokens: 10, completion_tokens: 5 },
    };
    const stale = {
      id: "req-1",
      status: "streaming",
      response: { content: "[Streaming in progress...]", type: "streaming" },
      tokens: { prompt_tokens: 0, completion_tokens: 0 },
    };

    const merged = mergeRequestDetailMonotonic(terminal, stale);
    expect(merged.status).toBe("success");
    expect(merged.tokens.completion_tokens).toBe(5);
  });

  it("allows terminal overwrite with newer terminal detail", () => {
    const first = { id: "req-2", status: "partial", tokens: { prompt_tokens: 1, completion_tokens: 1 } };
    const second = { id: "req-2", status: "success", tokens: { prompt_tokens: 2, completion_tokens: 4 } };
    const merged = mergeRequestDetailMonotonic(first, second);
    expect(merged.status).toBe("success");
    expect(merged.tokens.completion_tokens).toBe(4);
  });
});
