"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const VIRTUAL_ROW_HEIGHT = 52;
export const VIRTUAL_THRESHOLD = 40;
const OVERSCAN = 6;
const DEFAULT_VIEW_HEIGHT = 384;

function computeRange(scrollTop, viewHeight, rowCount) {
  const start = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewHeight) / VIRTUAL_ROW_HEIGHT) + OVERSCAN,
  );
  return { start, end };
}

/** Window large model tables to visible rows inside the scroll container. */
export function useVirtualTableRows(rows, scrollContainerRef) {
  const rowCount = rows.length;
  const virtualize = rowCount > VIRTUAL_THRESHOLD;
  const [scrollMetrics, setScrollMetrics] = useState(null);
  const rafRef = useRef(null);

  const applyMetrics = useCallback((el) => {
    setScrollMetrics({
      scrollTop: el.scrollTop,
      viewHeight: el.clientHeight || DEFAULT_VIEW_HEIGHT,
    });
  }, []);

  useEffect(() => {
    if (!virtualize) return undefined;

    const el = scrollContainerRef?.current;
    if (!el) return undefined;

    const scheduleMetrics = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        applyMetrics(el);
      });
    };

    scheduleMetrics();

    el.addEventListener("scroll", scheduleMetrics, { passive: true });
    window.addEventListener("resize", scheduleMetrics);
    return () => {
      el.removeEventListener("scroll", scheduleMetrics);
      window.removeEventListener("resize", scheduleMetrics);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [applyMetrics, rowCount, scrollContainerRef, virtualize]);

  if (!virtualize) {
    return {
      virtualize: false,
      visibleRows: rows,
      topSpacer: 0,
      bottomSpacer: 0,
    };
  }

  const { scrollTop, viewHeight } = scrollMetrics ?? { scrollTop: 0, viewHeight: DEFAULT_VIEW_HEIGHT };
  const { start, end } = computeRange(scrollTop, viewHeight, rowCount);

  return {
    virtualize: true,
    visibleRows: rows.slice(start, end),
    topSpacer: start * VIRTUAL_ROW_HEIGHT,
    bottomSpacer: Math.max(0, (rowCount - end) * VIRTUAL_ROW_HEIGHT),
  };
}
