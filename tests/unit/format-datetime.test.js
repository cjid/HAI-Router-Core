import { describe, it, expect } from "vitest";
import { formatDateTime, normalizeTimezone, normalizeHourFormat } from "@/shared/utils/formatDateTime";

const SAMPLE_UTC = "2026-09-01T13:27:52.782Z";

describe("formatDateTime", () => {
  it("formats Asia/Jakarta in 24-hour mode", () => {
    const out = formatDateTime(SAMPLE_UTC, { timezone: "Asia/Jakarta", hourFormat: "24" });
    expect(out).toContain("01/09/2026");
    expect(out).toContain("20:27:52");
  });

  it("formats Asia/Jakarta in 12-hour mode with PM", () => {
    const out = formatDateTime(SAMPLE_UTC, { timezone: "Asia/Jakarta", hourFormat: "12" });
    expect(out.toLowerCase()).toMatch(/pm/);
    expect(out).toContain("01/09/2026");
  });

  it("formats UTC independently of host timezone", () => {
    const out = formatDateTime(SAMPLE_UTC, { timezone: "UTC", hourFormat: "24" });
    expect(out).toContain("13:27:52");
  });

  it("falls back invalid timezone to Asia/Jakarta", () => {
    expect(normalizeTimezone("Not/AZone")).toBe("Asia/Jakarta");
    const out = formatDateTime(SAMPLE_UTC, { timezone: "Not/AZone", hourFormat: "24" });
    expect(out).toContain("20:27:52");
  });

  it("normalizes hour format", () => {
    expect(normalizeHourFormat("12")).toBe("12");
    expect(normalizeHourFormat("24")).toBe("24");
    expect(normalizeHourFormat("invalid")).toBe("24");
  });
});
