import { describe, it, expect } from "vitest";
import { createPassthroughStreamWithLogger } from "../../open-sse/utils/stream.js";
import { pipeWithDisconnect, createStreamController } from "../../open-sse/utils/streamHandler.js";

const SEMANTIC = [
  'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":", how can I help you?"}}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
  "data: [DONE]\n\n",
].join("");

function splitIntoCharChunks(text) {
  return text.split("").map((c) => new TextEncoder().encode(c));
}

function splitIntoRandomChunks(text, seed = 7) {
  const out = [];
  let i = 0;
  let s = seed;
  while (i < text.length) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const n = 1 + (s % 12);
    out.push(new TextEncoder().encode(text.slice(i, i + n)));
    i += n;
  }
  return out;
}

async function runPassthrough(chunks) {
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
    "conn-a",
    { messages: [{ role: "user", content: "hi" }] },
    (_content, u) => { usage = u; },
  );
  const ctrl = createStreamController({ provider: "openai", model: "gpt-test" });
  const out = pipeWithDisconnect({ body: upstream, headers: new Headers() }, transform, ctrl, null, 5000);

  const reader = out.getReader();
  const parts = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(new TextDecoder().decode(value));
  }
  return { text: parts.join(""), usage };
}

describe("stream usage chunk invariance", () => {
  it("identical usage for one-chunk vs char-chunk vs random-chunk delivery", async () => {
    const one = await runPassthrough([new TextEncoder().encode(SEMANTIC)]);
    const chars = await runPassthrough(splitIntoCharChunks(SEMANTIC));
    const random = await runPassthrough(splitIntoRandomChunks(SEMANTIC));

    expect(one.text).toContain("Hello");
    expect(chars.text).toContain("Hello");
    expect(random.text).toContain("Hello");

    expect(one.usage?.outputTokens).toBe(chars.usage?.outputTokens);
    expect(one.usage?.outputTokens).toBe(random.usage?.outputTokens);
    expect(one.usage?.inputTokens).toBe(chars.usage?.inputTokens);
  });

  it("SSE heartbeat comments do not change output token accounting", async () => {
    const withHeartbeats = SEMANTIC.replace(
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      ': ping\n\n: ping\n\ndata: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
    );
    const plain = await runPassthrough([new TextEncoder().encode(SEMANTIC)]);
    const hb = await runPassthrough([new TextEncoder().encode(withHeartbeats)]);

    expect(plain.usage?.outputTokens).toBe(hb.usage?.outputTokens);
    expect(plain.usage?.inputTokens).toBe(hb.usage?.inputTokens);
  });
});

describe("stream jitter relay", () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[idx];
  }

  it("preserves provider inter-event gaps within localhost budget", async () => {
    const gapsMs = [20, 80, 30, 150, 25, 40];
    const events = gapsMs.map((_, i) =>
      `data: {"choices":[{"delta":{"content":"t${i}"}}]}\n\n`,
    );
    events.push("data: [DONE]\n\n");

    const receiveTimes = [];
    const upstream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < events.length; i++) {
          if (i > 0) await sleep(gapsMs[i - 1]);
          controller.enqueue(new TextEncoder().encode(events[i]));
        }
        controller.close();
      },
    });

    const transform = createPassthroughStreamWithLogger("openai", null, "gpt-test", "conn-a", null);
    const ctrl = createStreamController({ provider: "openai", model: "gpt-test" });
    const out = pipeWithDisconnect({ body: upstream, headers: new Headers() }, transform, ctrl, null, 30000);

    const reader = out.getReader();
    let last = null;
    const clientGaps = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const now = Date.now();
      const text = new TextDecoder().decode(value);
      if (!text.includes('"content"')) continue;
      if (last != null) clientGaps.push(now - last);
      last = now;
    }

    const contentEvents = gapsMs.length;
    expect(clientGaps.length).toBe(contentEvents - 1);
    const routerOverhead = clientGaps.map((g, i) => g - gapsMs[i]);
    routerOverhead.sort((a, b) => a - b);
    const p95 = percentile(routerOverhead, 95);
    expect(p95).toBeLessThan(100);
  }, 15000);

  it("fast client receives burst promptly without artificial spreading", async () => {
    const burst = Array.from({ length: 10 }, (_, i) =>
      `data: {"choices":[{"delta":{"content":"${i}"}}]}\n\n`,
    ).join("");
    const t0 = Date.now();
    const upstream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(burst));
        c.close();
      },
    });
    const transform = createPassthroughStreamWithLogger("openai", null, "gpt-test", "conn-a", null);
    const ctrl = createStreamController({ provider: "openai", model: "gpt-test" });
    const out = pipeWithDisconnect({ body: upstream, headers: new Headers() }, transform, ctrl, null, 5000);
    const reader = out.getReader();
    let chunks = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (new TextDecoder().decode(value).includes("content")) chunks++;
    }
    const elapsed = Date.now() - t0;
    expect(chunks).toBe(10);
    expect(elapsed).toBeLessThan(500);
  });
});
