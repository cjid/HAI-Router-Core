import { describe, it, expect, beforeEach } from "vitest";
import {
  appendGoEngineEvent,
  listGoEngineEvents,
  clearGoEngineEventsForTests,
} from "@/lib/db/repos/goEngineEventsRepo.js";

describe("goEngineEventsRepo", () => {
  beforeEach(async () => {
    await clearGoEngineEventsForTests();
  });

  it("persists and lists events newest-first without overwriting", async () => {
    await appendGoEngineEvent({
      at: "2026-09-01T10:00:00.000Z",
      event: "start_requested",
      message: "start_requested",
      level: "info",
    });
    await appendGoEngineEvent({
      at: "2026-09-01T10:00:01.000Z",
      event: "engine_running",
      message: "workers=1",
      level: "success",
    });

    const events = await listGoEngineEvents({ limit: 10 });
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("engine_running");
    expect(events[1].event).toBe("start_requested");
  });

  it("retains more than the old in-memory cap of 10", async () => {
    for (let i = 0; i < 25; i += 1) {
      await appendGoEngineEvent({
        at: new Date(Date.UTC(2026, 8, 1, 0, 0, i)).toISOString(),
        event: `evt_${i}`,
        message: `evt_${i}`,
      });
    }
    const events = await listGoEngineEvents({ limit: 50 });
    expect(events.length).toBe(25);
    expect(events[0].event).toBe("evt_24");
  });
});
