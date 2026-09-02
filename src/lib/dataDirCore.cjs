/**
 * Shared data-directory resolution (CJS) — used by ESM dataDir.js and MITM paths.
 * Canonical: ~/.hairouter / HAI_ROUTER_DATA_DIR
 * Legacy read + one-time migration from ~/.9router or *9router* configured paths.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const CANONICAL_APP_NAME = "hairouter";
const LEGACY_APP_NAME = "9router";
const MIGRATION_MARKER = ".migrated-to-hairouter";

function dirForApp(appName) {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), appName);
  }
  return path.join(os.homedir(), `.${appName}`);
}

/** @returns {string|null} */
function resolveConfiguredDataDirEnv() {
  return (
    process.env.HAI_ROUTER_DATA_DIR
    || process.env.DATA_DIR
    || process.env.LEGACY_9ROUTER_DATA_DIR
    || null
  );
}

/** Map explicit legacy env paths (e.g. /var/lib/9router) to canonical (/var/lib/hairouter). */
function deriveCanonicalDataPath(configured) {
  if (!configured || typeof configured !== "string") return configured;
  if (!/9router/i.test(configured)) return configured;
  return configured.replace(/9router/gi, CANONICAL_APP_NAME);
}

function isLegacyDataPath(dirPath) {
  if (!dirPath) return false;
  const norm = dirPath.replace(/\\/g, "/").toLowerCase();
  return norm.includes(`/${LEGACY_APP_NAME}`) || norm.endsWith(`/${LEGACY_APP_NAME}`)
    || norm.includes(`/.${LEGACY_APP_NAME}`) || norm.endsWith(`.${LEGACY_APP_NAME}`);
}

function migrateLegacyDataDirIfNeeded(canonicalPath, legacyPath) {
  if (!legacyPath || !fs.existsSync(legacyPath)) return canonicalPath;
  if (fs.existsSync(canonicalPath)) return canonicalPath;

  const marker = path.join(legacyPath, MIGRATION_MARKER);
  const copyLegacy = () => {
    if (!fs.existsSync(canonicalPath)) {
      fs.cpSync(legacyPath, canonicalPath, { recursive: true, force: false });
    }
  };

  if (fs.existsSync(marker)) {
    try {
      copyLegacy();
      return canonicalPath;
    } catch {
      console.warn(`[DATA_DIR] identity_migration_failed using legacy=${legacyPath}`);
      return legacyPath;
    }
  }

  try {
    console.info(`[DATA_DIR] identity_migration_started legacy=${legacyPath} canonical=${canonicalPath}`);
    copyLegacy();
    fs.writeFileSync(marker, new Date().toISOString(), "utf8");
    console.info(`[DATA_DIR] identity_migration_completed legacy=${legacyPath} canonical=${canonicalPath}`);
    return canonicalPath;
  } catch (e) {
    console.error(`[DATA_DIR] identity_migration_failed error=${e?.message || e}`);
    if (fs.existsSync(legacyPath)) return legacyPath;
    return canonicalPath;
  }
}

function ensureWritableDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function resolveConfiguredDir(configured) {
  const trimmed = String(configured).trim();
  if (!trimmed) return null;

  if (process.platform === "win32" && /^\//.test(trimmed)) {
    console.warn(`[DATA_DIR] '${trimmed}' is a Unix path on Windows → fallback to default`);
    return null;
  }

  const canonicalFromEnv = deriveCanonicalDataPath(trimmed);
  const legacyFromEnv = isLegacyDataPath(trimmed) ? trimmed : null;

  if (legacyFromEnv && canonicalFromEnv && legacyFromEnv !== canonicalFromEnv) {
    return migrateLegacyDataDirIfNeeded(canonicalFromEnv, legacyFromEnv);
  }

  try {
    return ensureWritableDir(trimmed);
  } catch (e) {
    if (e?.code === "EACCES" || e?.code === "EPERM") {
      console.warn(`[DATA_DIR] '${trimmed}' not writable → fallback ~/.${CANONICAL_APP_NAME}`);
      return null;
    }
    throw e;
  }
}

function defaultHomeDir() {
  const canonical = dirForApp(CANONICAL_APP_NAME);
  const legacy = dirForApp(LEGACY_APP_NAME);
  return migrateLegacyDataDirIfNeeded(canonical, legacy);
}

function getDataDir() {
  const configured = resolveConfiguredDataDirEnv();
  if (configured) {
    const resolved = resolveConfiguredDir(configured);
    if (resolved) return resolved;
  }
  return defaultHomeDir();
}

function getCanonicalDataDir() {
  return dirForApp(CANONICAL_APP_NAME);
}

function getLegacyDataDir() {
  return dirForApp(LEGACY_APP_NAME);
}

function getDisplayDbPath() {
  const dir = getDataDir();
  const home = os.homedir();
  const rel = dir.startsWith(home) ? `~${dir.slice(home.length)}` : dir;
  return `${rel.replace(/\\/g, "/")}/db/data.sqlite`;
}

module.exports = {
  CANONICAL_APP_NAME,
  LEGACY_APP_NAME,
  MIGRATION_MARKER,
  resolveConfiguredDataDirEnv,
  deriveCanonicalDataPath,
  migrateLegacyDataDirIfNeeded,
  getDataDir,
  getCanonicalDataDir,
  getLegacyDataDir,
  getDisplayDbPath,
};
