import { describe, it, expect } from "vitest";
import {
  classifyLlmTurnType,
  classifyTurnFromChatCompletion,
  classifyTurnFromRequestDetail,
  getLlmTurnLabel,
} from "@/shared/utils/llmTurnType.js";

describe("llmTurnType", () => {
  it("classifies tool call turns", () => {
    expect(classifyLlmTurnType({ finishReason: "tool_calls" })).toBe("tool_call");
    expect(classifyLlmTurnType({ hasToolCalls: true, finishReason: "stop" })).toBe("tool_call");
  });

  it("classifies normal message turns", () => {
    expect(classifyLlmTurnType({ finishReason: "stop", hasContent: true })).toBe("message");
  });

  it("classifies reasoning-only turns", () => {
    expect(classifyLlmTurnType({ hasThinking: true, hasContent: false })).toBe("reasoning");
  });

  it("classifies chat completion bodies", () => {
    expect(classifyTurnFromChatCompletion({
      choices: [{
        finish_reason: "tool_calls",
        message: { role: "assistant", content: null, tool_calls: [{ id: "1", type: "function", function: { name: "read", arguments: "{}" } }] },
      }],
    })).toBe("tool_call");
  });

  it("derives turn type from stored request detail", () => {
    expect(classifyTurnFromRequestDetail({
      status: "success",
      response: { content: "hello", finish_reason: "stop" },
    })).toBe("message");
  });

  it("labels turn types for UI", () => {
    expect(getLlmTurnLabel("tool_call")).toBe("Tool Call");
    expect(getLlmTurnLabel("message")).toBe("Message");
  });
});
