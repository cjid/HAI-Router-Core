const path = require("path");
const core = require("../lib/dataDirCore.cjs");

const DATA_DIR = core.getDataDir();
const MITM_DIR = path.join(DATA_DIR, "mitm");

module.exports = {
  DATA_DIR,
  MITM_DIR,
  CANONICAL_APP_NAME: core.CANONICAL_APP_NAME,
  LEGACY_APP_NAME: core.LEGACY_APP_NAME,
};
