/**
 * CLI data-directory resolution — delegates to app SSOT (dataDirCore.cjs).
 * Canonical: ~/.hairouter / %APPDATA%\\hairouter\\
 */
const core = require("./dataDirCore.cjs");

function getDataDir() {
  return core.getDataDir();
}

module.exports = {
  getDataDir,
  getCanonicalDataDir: core.getCanonicalDataDir,
  getLegacyDataDir: core.getLegacyDataDir,
};
