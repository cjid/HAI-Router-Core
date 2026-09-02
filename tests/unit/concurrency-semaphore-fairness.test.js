import { describe, it, expect } from "vitest";
import { Semaphore } from "../../open-sse/concurrency/semaphore.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("semaphore — session-aware fairness", () => {
  it("dequeues across sessions with fewer active slots first", async () => {
    const sem = new Semaphore({ capacity: 1, maxQueue: 8, queueTimeoutMs: 2000, name: "fair" });
    const order = [];

    const a = await sem.acquire({ sessionId: "session-a" });
    const bPromise = sem.acquire({ sessionId: "session-b" }).then((t) => {
      order.push("b-start");
      return t;
    });
    const cPromise = sem.acquire({ sessionId: "session-c" }).then((t) => {
      order.push("c-start");
      return t;
    });

    await sleep(20);
    expect(order).toEqual([]);

    a();
    await sleep(20);
    expect(order.length).toBe(1);

    const first = order[0];
    const secondPromise = first === "b-start" ? cPromise : bPromise;
    const firstTicket = first === "b-start" ? await bPromise : await cPromise;

    firstTicket();
    await secondPromise;
    await sleep(20);
    expect(order.length).toBe(2);
    expect(new Set(order)).toEqual(new Set(["b-start", "c-start"]));
  });
});
