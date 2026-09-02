export const HEATMAP_DAYS = 60;

export function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Rolling window ending today (inclusive), aligned with Usage & Analytics 60D filter. */
export function getHeatmapRange() {
  const rangeEnd = new Date();
  rangeEnd.setHours(0, 0, 0, 0);
  const rangeStart = new Date(rangeEnd);
  rangeStart.setDate(rangeStart.getDate() - (HEATMAP_DAYS - 1));
  return { rangeStart, rangeEnd };
}

export function heatmapLevel(count, max) {
  if (!count) return 0;
  if (!max) return 1;
  const ratio = count / max;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

/**
 * 7 rows × N columns; each column is exactly 7 cells (no null gaps).
 * Days fill top-to-bottom, left-to-right from rangeStart. The last column
 * is padded with inert filler cells so a lone activity day is not isolated.
 */
export function buildHeatmapGrid(dayMap = {}) {
  const { rangeStart, rangeEnd } = getHeatmapRange();
  const days = [];
  let maxDayRequests = 0;

  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    const key = toDateKey(cursor);
    const day = dayMap[key] || { requests: 0, tokens: 0 };
    const count = Number(day.requests) || 0;
    const tokens = Number(day.tokens) || 0;
    if (count > maxDayRequests) maxDayRequests = count;
    days.push({ date: key, count, tokens });
    cursor.setDate(cursor.getDate() + 1);
  }

  const remainder = days.length % 7;
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      days.push({ date: null, count: 0, tokens: 0, filler: true });
    }
  }

  const columnCount = days.length / 7;
  const rows = Array.from({ length: 7 }, (_, rowIdx) =>
    Array.from({ length: columnCount }, (_, colIdx) => {
      const cell = days[colIdx * 7 + rowIdx];
      return {
        ...cell,
        level: cell.filler ? 0 : heatmapLevel(cell.count, maxDayRequests),
      };
    }),
  );

  return {
    rows,
    weekCount: columnCount,
    rangeStart: toDateKey(rangeStart),
    rangeEnd: toDateKey(rangeEnd),
  };
}
