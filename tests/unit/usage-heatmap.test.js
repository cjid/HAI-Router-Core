import { describe, it, expect } from "vitest";
import { HEATMAP_DAYS, getHeatmapRange, buildHeatmapGrid, toDateKey } from "../../src/shared/utils/usageHeatmap.js";

describe("usageHeatmap", () => {
  it("uses a 60-day rolling window", () => {
    expect(HEATMAP_DAYS).toBe(60);
    const { rangeStart, rangeEnd } = getHeatmapRange();
    const start = new Date(`${toDateKey(rangeStart)}T12:00:00`);
    const end = new Date(`${toDateKey(rangeEnd)}T12:00:00`);
    const spanDays = Math.round((end - start) / 86400000) + 1;
    expect(spanDays).toBe(60);
  });

  it("builds a padded 7-row grid for 60 days", () => {
    const grid = buildHeatmapGrid({});
    expect(grid.rows).toHaveLength(7);
    expect(grid.weekCount).toBe(9); // 60 days → 63 cells → 9 columns
    expect(grid.rangeStart).toBeTruthy();
    expect(grid.rangeEnd).toBeTruthy();
  });
});
