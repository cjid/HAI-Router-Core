import { describe, it, expect } from "vitest";
import { createPassthroughStreamWithLogger } from "../../open-sse/utils/stream.js";
import { pipeWithDisconnect, createStreamController } from "../../open-sse/utils/streamHandler.js";

const finish = 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n';
const done = "data: [DONE]\n\n";

function extractOpenAIContentDeltas(sseText) {
  const contents = [];
  for (const block of sseText.split("\n\n")) {
    const line = block.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    const raw = line.slice(5).trim();
    if (raw === "[DONE]") continue;
    try {
      const parsed = JSON.parse(raw);
      const c = parsed?.choices?.[0]?.delta?.content;
      if (typeof c === "string" && c.length > 0) contents.push(c);
      const r = parsed?.choices?.[0]?.delta?.reasoning_content;
      if (typeof r === "string" && r.length > 0) contents.push({ type: "reasoning", text: r });
    } catch { /* skip */ }
  }
  return contents;
}

async function runPassthrough(chunks, onComplete) {
  let usage = null;
  const upstream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });

  const transform = createPassthroughStreamWithLogger(
    "openai",
    null,
    "gpt-test",
    "conn-truth",
    { messages: [{ role: "user", content: "hi" }] },
    (content, u) => {
      usage = u;
      onComplete?.(content, u);
    },
  );

  const ctrl = createStreamController({ provider: "openai", model: "gpt-test" });
  const out = pipeWithDisconnect({ body: upstream, headers: new Headers() }, transform, ctrl, null, 15000);
  const reader = out.getReader();
  const parts = [];
  const receiveTimes = [];
  while (true) {
    const { done: eof, value } = await reader.read();
    if (eof) break;
    receiveTimes.push(Date.now());
    parts.push(new TextDecoder().decode(value));
  }
  return { text: parts.join(""), usage, receiveTimes };
}

describe("provider-truthful stream regression", () => {
  it("preserves separate provider content deltas without subdivision", async () => {
    const deltaA = "The user is confused about what feature to update.";
    const deltaB = " Let me inspect the repository.";
    const semantic = [
      `data: {"choices":[{"delta":{"content":"${deltaA}"}}]}\n\n`,
      `data: {"choices":[{"delta":{"content":"${deltaB}"}}]}\n\n`,
      finish,
      done,
    ].join("");

    const { text } = await runPassthrough([new TextEncoder().encode(semantic)]);
    const contents = extractOpenAIContentDeltas(text).filter((d) => typeof d === "string");
    expect(contents).toEqual([deltaA, deltaB]);
  });

  it("forwards one large provider delta as one client content event", async () => {
    const large = "L".repeat(500);
    const semantic = [
      `data: {"choices":[{"delta":{"content":"${large}"}}]}\n\n`,
      finish,
      done,
    ].join("");

    const { text } = await runPassthrough([new TextEncoder().encode(semantic)]);
    const contents = extractOpenAIContentDeltas(text).filter((d) => typeof d === "string");
    expect(contents.length).toBe(1);
    expect(contents[0]).toBe(large);
    expect(contents[0].length).toBe(500);
  });

  it("preserves reasoning then content event order", async () => {
    const semantic = [
      'data: {"choices":[{"delta":{"reasoning_content":"think step one"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":" think step two"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Answer text"}}]}\n\n',
      finish,
      done,
    ].join("");

    const { text } = await runPassthrough([new TextEncoder().encode(semantic)]);
    const events = extractOpenAIContentDeltas(text);
    expect(events[0]).toEqual({ type: "reasoning", text: "think step one" });
    expect(events[1]).toEqual({ type: "reasoning", text: " think step two" });
    expect(events[2]).toBe("Answer text");
  });

  it("usage unchanged for multi-delta vs single-delta same semantic content", async () => {
    const partA = "Hello";
    const partB = " world";
    const multi = [
      `data: {"choices":[{"delta":{"content":"${partA}"}}]}\n\n`,
      `data: {"choices":[{"delta":{"content":"${partB}"}}]}\n\n`,
      finish,
      done,
    ].join("");
    const single = [
      `data: {"choices":[{"delta":{"content":"${partA}${partB}"}}]}\n\n`,
      finish,
      done,
    ].join("");

    const multiResult = await runPassthrough([new TextEncoder().encode(multi)]);
    const singleResult = await runPassthrough([new TextEncoder().encode(single)]);

    expect(multiResult.usage?.outputTokens).toBe(singleResult.usage?.outputTokens);
    expect(multiResult.usage?.inputTokens).toBe(singleResult.usage?.inputTokens);
  });

  it("preserves provider stall gap without filler content", async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const gapMs = 80;
    const deltaA = "First.";
    const deltaB = " Second.";
    const t0 = Date.now();
    const contentArrivalTimes = [];

    const upstream = new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode(
          `data: {"choices":[{"delta":{"content":"${deltaA}"}}]}\n\n`,
        ));
        await sleep(gapMs);
        controller.enqueue(new TextEncoder().encode(
          `data: {"choices":[{"delta":{"content":"${deltaB}"}}]}\n\n${finish}${done}`,
        ));
        controller.close();
      },
    });

    const transform = createPassthroughStreamWithLogger("openai", null, "gpt-test", "conn-gap", null);
    const ctrl = createStreamController({ provider: "openai", model: "gpt-test" });
    const out = pipeWithDisconnect({ body: upstream, headers: new Headers() }, transform, ctrl, null, 20000);

    const reader = out.getReader();
    let buffer = "";
    const seenContents = [];
    while (true) {
      const { done: eof, value } = await reader.read();
      if (eof) break;
      buffer += new TextDecoder().decode(value);
      for (const c of extractOpenAIContentDeltas(buffer).filter((d) => typeof d === "string")) {
        if (seenContents.includes(c)) continue;
        seenContents.push(c);
        contentArrivalTimes.push(Date.now() - t0);
      }
    }

    expect(seenContents).toEqual([deltaA, deltaB]);
    expect(contentArrivalTimes.length).toBe(2);
    const clientGap = contentArrivalTimes[1] - contentArrivalTimes[0];
    expect(clientGap).toBeGreaterThanOrEqual(gapMs - 30);
    expect(clientGap).toBeLessThan(gapMs + 250);
  });
});
