"use client";

import { useCallback, useEffect } from "react";
import useSettingsStore from "@/store/settingsStore";
import { formatDateTime, getDateTimeSettingsFromRecord } from "@/shared/utils/formatDateTime";

/** Client hook — reads global timezone/hourFormat from settings store SSOT. */
export function useDateTimeFormat() {
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  useEffect(() => {
    if (!settings) fetchSettings().catch(() => {});
  }, [settings, fetchSettings]);

  const { timezone, hourFormat } = getDateTimeSettingsFromRecord(settings);

  const format = useCallback(
    (value) => formatDateTime(value, { timezone, hourFormat }),
    [timezone, hourFormat],
  );

  return { timezone, hourFormat, formatDateTime: format };
}
