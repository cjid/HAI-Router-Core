// Go Engine audit event log — table created via declarative schema sync.
export default {
  version: 3,
  name: "go-engine-events",
  up() {
    // No-op: goEngineEvents is added via TABLES + syncSchemaFromTables.
  },
};
