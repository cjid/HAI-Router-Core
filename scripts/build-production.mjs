#!/usr/bin/env node
/**
 * Production build wrapper — project-local TEMP/TMP and pre-build cleanup so
 * Next/webpack scratch locks do not collide with IDE/system temp on Windows.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildTemp = join(root, ".tmp-build", "next-temp");
const buildHomeDir = join(root, ".tmp-build", "build-home");
const nextDir = join(root, ".next");

mkdirSync(buildTemp, { recursive: true });
mkdirSync(join(buildHomeDir, "AppData", "Roaming"), { recursive: true });
mkdirSync(join(buildHomeDir, "AppData", "Local"), { recursive: true });

// Remove stale Next output and lock files from prior interrupted builds.
if (existsSync(nextDir)) {
  rmSync(nextDir, { recursive: true, force: true });
}
const nextLock = join(nextDir, "lock");
if (existsSync(nextLock)) {
  rmSync(nextLock, { force: true });
}

// Best-effort: clear Cursor IDE scratch locks that cause EPERM readlink on Windows.
const systemTemp = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, "Temp")
  : join(process.env.USERPROFILE || "", "AppData", "Local", "Temp");
if (existsSync(systemTemp)) {
  for (const name of ["E3F09CB5-3598-4FF9-A028-A35D6DD1A196.scratch"]) {
    const scratch = join(systemTemp, name);
    if (existsSync(scratch)) {
      try {
        rmSync(scratch, { recursive: true, force: true });
      } catch {
        /* ignore — may be held by IDE */
      }
    }
  }
}

const env = {
  ...process.env,
  TEMP: buildTemp,
  TMP: buildTemp,
  TMPDIR: buildTemp,
  HOME: buildHomeDir,
  USERPROFILE: buildHomeDir,
  APPDATA: join(buildHomeDir, "AppData", "Roaming"),
  LOCALAPPDATA: join(buildHomeDir, "AppData", "Local"),
};

const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const result = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
  cwd: root,
  stdio: "inherit",
  env,
});

process.exit(result.status === null ? 1 : result.status);
