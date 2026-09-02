/**
 * Structured Go Engine events → HAI-Router console log buffer.
 * Fail-open: logging errors never throw to callers.
 */

const SECRET_PATTERNS = [
  /authorization\s*[:=]\s*[^\s]+/gi,
  /bearer\s+[^\s]+/gi,
  /api[_-]?key\s*[:=]\s*[^\s]+/gi,
  /proxy-authorization\s*[:=]\s*[^\s]+/gi,
  /x-hai-worker-token\s*[:=]\s*[^\s]+/gi,
  /:\/\/[^@\s]+:[^@\s]+@/g,
  /secret-token[^\s]*/gi,
];

function sanitizeMessage(input) {
  let msg = String(input ?? "");
  for (const re of SECRET_PATTERNS) {
    msg = msg.replace(re, "[redacted]");
  }
  return msg;
}

function formatLine(payload) {
  const level = (payload.level || "info").toUpperCase();
  const component = payload.component || "GO_ENGINE";
  const parts = [`[${component}]`];
  if (payload.requestId) parts.push(`request=${payload.requestId}`);
  if (payload.workerId != null) parts.push(`worker=${payload.workerId}`);
  if (payload.providerId) parts.push(`provider=${payload.providerId}`);
  if (payload.event) parts.push(`event=${payload.event}`);
  const message = sanitizeMessage(payload.message || "");
  if (message) parts.push(message);
  return `[${level}] ${parts.join(" ")}`;
}

/**
 * @param {object} payload
 * @param {"debug"|"info"|"warn"|"error"} [payload.level]
 * @param {string} [payload.component]
 * @param {string} [payload.event]
 * @param {string|number} [payload.workerId]
 * @param {string} [payload.requestId]
 * @param {string} [payload.providerId]
 * @param {string} [payload.connectionId]
 * @param {string} [payload.message]
 */
export function logGoEngineEvent(payload = {}) {
  try {
    const line = formatLine(payload);
    const level = String(payload.level || "info").toLowerCase();
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else if (level === "debug") console.debug(line);
    else console.info(line);
  } catch {
    // fail-open
  }
}

export function parseWorkerLogLine(line, workerIndex) {
  const text = String(line || "").trim();
  if (!text) return;
  const workerId = `worker-${workerIndex}`;
  if (text.includes("HAI_WORKER_READY")) {
    logGoEngineEvent({
      level: "info",
      component: "GO:WORKER",
      event: "worker_ready",
      workerId,
      message: text,
    });
    return;
  }
  logGoEngineEvent({
    level: "info",
    component: "GO:WORKER",
    workerId,
    message: text,
  });
}
