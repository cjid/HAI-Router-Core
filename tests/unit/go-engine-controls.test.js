import { describe, it, expect } from "vitest";
import { getGoEngineControls } from "@/shared/utils/goEngineControls";

describe("getGoEngineControls", () => {
  it("STOPPED enables only Start", () => {
    expect(getGoEngineControls("STOPPED")).toEqual({
      start: true,
      pause: false,
      resume: false,
      stop: false,
      restart: false,
    });
  });

  it("RUNNING enables Pause, Stop, Restart", () => {
    expect(getGoEngineControls("RUNNING")).toEqual({
      start: false,
      pause: true,
      resume: false,
      stop: true,
      restart: true,
    });
  });

  it("PAUSED enables Resume, Stop, Restart", () => {
    expect(getGoEngineControls("PAUSED")).toEqual({
      start: false,
      pause: false,
      resume: true,
      stop: true,
      restart: true,
    });
  });

  it("STARTING disables all while busy", () => {
    const c = getGoEngineControls("STARTING");
    expect(Object.values(c).every((v) => v === false)).toBe(true);
  });

  it("busy locks conflicting actions", () => {
    expect(getGoEngineControls("RUNNING", { busy: true }).pause).toBe(false);
  });

  it("FAILED enables Start and Stop", () => {
    expect(getGoEngineControls("FAILED")).toEqual({
      start: true,
      pause: false,
      resume: false,
      stop: true,
      restart: false,
    });
  });
});
