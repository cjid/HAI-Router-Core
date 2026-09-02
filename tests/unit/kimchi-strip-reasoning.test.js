/**
 * Kimchi executor: strip reasoning_content echoed by clients.
 */
import { describe, it, expect } from "vitest";

import KimchiExecutor, { stripReasoningContent } from "../../open-sse/executors/kimchi.js";
import DefaultExecutor from "../../open-sse/executors/default.js";

describe("kimchi stripReasoningContent", () => {
  it("removes long reasoning_content from assistant messages but keeps content", () => {
    const body = {
      messages: [
        { role: "user", content: "solve x+5=12" },
        {
          role: "assistant",
          content: "x = 7",
          reasoning_content: "subtract 5 from both sides ... (long reasoning block)",
        },
        { role: "user", content: "now try x+10=20" },
      ],
    };
    stripReasoningContent(body);
    expect(body.messages[1].reasoning_content).toBeUndefined();
    expect(body.messages[1].content).toBe("x = 7");
  });

  it("preserves the 1-char placeholder that injectReasoningContent sets", () => {
    const body = {
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello", reasoning_content: " " },
      ],
    };
    stripReasoningContent(body);
    expect(body.messages[1].reasoning_content).toBe(" ");
    expect(body.messages[1].content).toBe("hello");
  });

  it("preserves short custom reasoning under the threshold", () => {
    const body = {
      messages: [
        { role: "assistant", content: "ok", reasoning_content: "short" },
      ],
    };
    stripReasoningContent(body);
    expect(body.messages[0].reasoning_content).toBe("short");
  });

  it("leaves non-assistant messages untouched", () => {
    const body = {
      messages: [
        { role: "user", content: "hi" },
        { role: "system", content: "be helpful" },
      ],
    };
    stripReasoningContent(body);
    expect(body.messages[0].content).toBe("hi");
    expect(body.messages[1].content).toBe("be helpful");
  });

  it("returns early on missing/empty messages array", () => {
    expect(() => stripReasoningContent({})).not.toThrow();
    expect(() => stripReasoningContent({ messages: null })).not.toThrow();
    expect(() => stripReasoningContent({ messages: [] })).not.toThrow();
  });

  it("ignores assistant messages that have no reasoning_content", () => {
    const body = {
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    };
    stripReasoningContent(body);
    expect(body.messages[1]).toEqual({ role: "assistant", content: "hello" });
  });

  it("handles multi-turn: strips old turns, keeps recent one", () => {
    const LONG = "x".repeat(1000);
    const body = {
      messages: [
        { role: "user", content: "q1" },
        { role: "assistant", content: "a1", reasoning_content: LONG },
        { role: "user", content: "q2" },
        { role: "assistant", content: "a2", reasoning_content: " " },
      ],
    };
    stripReasoningContent(body);
    expect(body.messages[1].reasoning_content).toBeUndefined();
    expect(body.messages[3].reasoning_content).toBe(" ");
  });
});

describe("kimchi executor wiring", () => {
  it("KimchiExecutor extends DefaultExecutor via prototype chain", () => {
    const inst = new KimchiExecutor();
    expect(inst instanceof DefaultExecutor).toBe(true);
  });

  it("default export is KimchiExecutor class", () => {
    expect(typeof KimchiExecutor).toBe("function");
    expect(KimchiExecutor.name).toBe("KimchiExecutor");
  });
});
