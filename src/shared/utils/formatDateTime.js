import { DEFAULT_HOUR_FORMAT, DEFAULT_TIMEZONE } from "@/shared/constants/timezones";

/** Validate IANA timezone; fallback to Asia/Jakarta. */
export function normalizeTimezone(timezone) {
  const candidate = typeof timezone === "string" ? timezone.trim() : "";
  if (!candidate) return DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Normalize hour format to "12" | "24". */
export function normalizeHourFormat(hourFormat) {
  return hourFormat === "12" ? "12" : "24";
}

/**
 * Format a UTC/canonical timestamp for display using global locale settings.
 * Storage/API remain UTC — only presentation uses timezone + hour format.
 */
export function formatDateTime(value, options = {}) {
  if (value == null || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const timezone = normalizeTimezone(options.timezone);
  const hourFormat = normalizeHourFormat(options.hourFormat ?? DEFAULT_HOUR_FORMAT);

  return date.toLocaleString("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: hourFormat === "12",
  });
}

export function getDateTimeSettingsFromRecord(settings) {
  return {
    timezone: normalizeTimezone(settings?.timezone),
    hourFormat: normalizeHourFormat(settings?.hourFormat ?? DEFAULT_HOUR_FORMAT),
  };
}
