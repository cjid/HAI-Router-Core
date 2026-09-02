// Backfill providerStates from existing connection isActive flags.
export default {
  version: 2,
  name: "provider-states",
  up(db) {
    const rows = db.all(`SELECT provider, isActive FROM providerConnections`);
    const byProvider = {};
    for (const row of rows) {
      if (!byProvider[row.provider]) byProvider[row.provider] = [];
      byProvider[row.provider].push(row.isActive);
    }
    const now = new Date().toISOString();
    for (const [providerId, actives] of Object.entries(byProvider)) {
      const isEnabled = actives.some((a) => a === 1 || a === true) ? 1 : 0;
      db.run(
        `INSERT INTO providerStates(providerId, isEnabled, updatedAt)
         VALUES(?, ?, ?)
         ON CONFLICT(providerId) DO NOTHING`,
        [providerId, isEnabled, now],
      );
    }
  },
};
