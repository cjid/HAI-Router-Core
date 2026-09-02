import { getAdapter } from "../driver.js";

const DEFAULT_LIST_LIMIT = 500;
const MAX_LIST_LIMIT = 2000;

/**
 * Persist a Go Engine lifecycle event for audit (fail-open at call site).
 * @param {{ at: string, event: string, message: string, level?: string, workerId?: string|null }} entry
 */
export async function appendGoEngineEvent(entry) {
  if (!entry?.event) return;
  const db = await getAdapter();
  db.run(
    `INSERT INTO goEngineEvents(timestamp, event, message, level, workerId)
     VALUES(?, ?, ?, ?, ?)`,
    [
      entry.at || new Date().toISOString(),
      String(entry.event),
      String(entry.message || entry.event),
      entry.level ? String(entry.level) : null,
      entry.workerId ? String(entry.workerId) : null,
    ],
  );
}

/**
 * List persisted Go Engine events (newest first).
 * @param {{ limit?: number }} [opts]
 */
export async function listGoEngineEvents({ limit = DEFAULT_LIST_LIMIT } = {}) {
  const db = await getAdapter();
  const capped = Math.max(1, Math.min(Number(limit) || DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
  const rows = db.all(
    `SELECT timestamp, event, message, level, workerId
     FROM goEngineEvents
     ORDER BY id DESC
     LIMIT ?`,
    [capped],
  );
  return rows.map((row) => ({
    at: row.timestamp,
    event: row.event,
    message: row.message,
    level: row.level || undefined,
    workerId: row.workerId || undefined,
  }));
}

/** Test helper — clear audit log. */
export async function clearGoEngineEventsForTests() {
  const db = await getAdapter();
  db.run(`DELETE FROM goEngineEvents`);
}
