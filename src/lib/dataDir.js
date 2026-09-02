import core from "./dataDirCore.cjs";

export const CANONICAL_APP_NAME = core.CANONICAL_APP_NAME;
export const LEGACY_APP_NAME = core.LEGACY_APP_NAME;
export const getCanonicalDataDir = core.getCanonicalDataDir;
export const getLegacyDataDir = core.getLegacyDataDir;
export const getDataDir = core.getDataDir;
export const getDisplayDbPath = core.getDisplayDbPath;
export const resolveConfiguredDataDirEnv = core.resolveConfiguredDataDirEnv;
export const deriveCanonicalDataPath = core.deriveCanonicalDataPath;

export const DATA_DIR = getDataDir();
