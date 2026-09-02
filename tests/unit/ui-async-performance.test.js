import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPollScheduler } from "../../src/shared/utils/pollScheduler.js";
import {
  isTerminalRequestStatus,
  shouldApplyListFetch,
  shouldApplyRequestDetailUpdate,
} from "../../src/shared/utils/asyncFetch.js";
import { isNearScrollBottom } from "../../src/shared/utils/scrollStick.js";

describe("createPollScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not overlap polls when previous poll is still pending", async () => {
    let active = 0;
    let maxActive = 0;
    const poll = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      active -= 1;
    });

    const scheduler = createPollScheduler({ intervalMs: 100, poll, isActive: () => true });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(250);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(maxActive).toBe(1);

    scheduler.stop();
  });

  it("stops scheduling after stop()", async () => {
    const poll = vi.fn(async () => {});
    const scheduler = createPollScheduler({ intervalMs: 100, poll, isActive: () => true });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(poll.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe("asyncFetch guards", () => {
  it("rejects stale list fetch when generation advanced", () => {
    expect(shouldApplyListFetch({ capturedGeneration: 1, activeGeneration: 2 })).toBe(false);
    expect(shouldApplyListFetch({ capturedGeneration: 2, activeGeneration: 2 })).toBe(true);
  });

  it("rejects detail update when selection changed", () => {
    expect(shouldApplyRequestDetailUpdate({
      capturedId: "a",
      activeId: "b",
      incomingStatus: "streaming",
      currentStatus: "streaming",
    })).toBe(false);
  });

  it("rejects terminal-to-streaming regression", () => {
    expect(isTerminalRequestStatus("completed")).toBe(true);
    expect(shouldApplyRequestDetailUpdate({
      capturedId: "req-1",
      activeId: "req-1",
      incomingStatus: "streaming",
      currentStatus: "completed",
    })).toBe(false);
  });

  it("allows streaming progress updates", () => {
    expect(shouldApplyRequestDetailUpdate({
      capturedId: "req-1",
      activeId: "req-1",
      incomingStatus: "streaming",
      currentStatus: "streaming",
    })).toBe(true);
  });
});

describe("isNearScrollBottom", () => {
  it("returns true when at bottom", () => {
    const el = {
      scrollHeight: 1000,
      scrollTop: 952,
      clientHeight: 48,
    };
    expect(isNearScrollBottom(el, 48)).toBe(true);
  });

  it("returns false when scrolled up", () => {
    const el = {
      scrollHeight: 1000,
      scrollTop: 100,
      clientHeight: 48,
    };
    expect(isNearScrollBottom(el, 48)).toBe(false);
  });
});
