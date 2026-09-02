/** Infer display level for captured console output (SSE logger uses console.log for errors too). */

const LEVEL_ORDER = ["DEBUG", "INFO", "LOG", "WARN", "ERROR"];

function rank(level) {
  const i = LEVEL_ORDER.indexOf(level);
  return i === -1 ? 2 : i;
}

function pickStronger(a, b) {
  return rank(a) >= rank(b) ? a : b;
}

/** Map console.* API level + message body → display level tag. */
export function inferConsoleLogLevel(apiLevel, message) {
  const normalized = String(apiLevel || "log").toLowerCase();
  let level = "LOG";

  if (normalized === "warn") level = "WARN";
  else if (normalized === "error") level = "ERROR";
  else if (normalized === "debug") level = "DEBUG";
  else if (normalized === "info") level = "INFO";

  const text = String(message || "");

  if (/\bERROR\s+\d{3}\b/.test(text) || /\b(ERROR|BLOCKED|FAILED|FATAL)\b/.test(text)) {
    level = pickStronger(level, "ERROR");
  }
  if (/❌|✗|💥/.test(text)) {
    level = pickStronger(level, "ERROR");
  }
  if (/\bWARN(?:ING)?\b/.test(text) || /⚠️/.test(text)) {
    level = pickStronger(level, "WARN");
  }
  if (/\[DBG:|🐛|\bDEBUG\b/.test(text)) {
    level = pickStronger(level, "DEBUG");
  }
  if (/ℹ️|\bINFO\b|📥/.test(text)) {
    level = pickStronger(level, "INFO");
  }

  return level;
}

/** Resolve level from a stored line (may include leading [LEVEL] tag from buffer). */
export function resolveLogLevelFromLine(line) {
  const text = String(line || "");
  const tagMatch = text.match(/^\[(LOG|INFO|WARN|ERROR|DEBUG)\]\s/i);
  const body = tagMatch ? text.slice(tagMatch[0].length) : text;
  const tagged = tagMatch?.[1]?.toUpperCase();

  if (tagged && tagged !== "LOG") return tagged;

  return inferConsoleLogLevel("log", body);
}

/** Hide internal capture tag; keep the original log text only. */
export function stripCaptureTag(line) {
  return String(line || "").replace(/^\[(LOG|INFO|WARN|ERROR|DEBUG)\]\s/i, "");
}

/** Skip noisy Next.js dev stack-trace lines in the dashboard console. */
export function shouldSkipConsoleLine(line) {
  const text = stripCaptureTag(line).trim();
  if (!text) return true;
  if (/^Import trace for requested module:/.test(text)) return true;
  if (/^https:\/\/nextjs\.org\/docs\//.test(text)) return true;
  if (/^\d+\s+\|/.test(text)) return true;
  if (/^>\s*\d+\s+\|/.test(text)) return true;
  return false;
}

export const CONSOLE_LEVEL_COLORS = {
  LOG: "text-green-400",
  INFO: "text-sky-400",
  WARN: "text-yellow-400",
  ERROR: "text-red-400",
  DEBUG: "text-violet-400",
};
