#!/usr/bin/env node
/**
 * Pre-commit guard: fail if staged/untracked-add set includes secrets, deps, or local artifacts.
 * Usage: node scripts/verify-commit-scope.mjs [--staged]
 */
import { execSync } from "node:child_process";
import { statSync } from "node:fs";

const stagedOnly = process.argv.includes("--staged");
const MAX_MB = Number(process.env.COMMIT_MAX_FILE_MB || 10);
const diffCmd = stagedOnly
  ? "git diff --cached --name-only --diff-filter=ACMR"
  : "git ls-files -o --exclude-standard";

const names = execSync(diffCmd, { encoding: "utf8" })
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

const BLOCK_PATTERNS = [
  /(^|[\\/])node_modules([\\/]|$)/i,
  /(^|[\\/])\.env(?!\.example)/i,
  /(^|[\\/])\.tmp-build([\\/]|$)/i,
  /\.tgz$/i,
  /\.sqlite(-shm|-wal)?$/i,
  /(^|[\\/])coverage([\\/]|$)/i,
  /(^|[\\/])\.next([\\/]|$)/i,
  /(^|[\\/])go-engine[\\/]bin([\\/]|$)/i,
  /(^|[\\/])cli[\\/]app([\\/]|$)/i,
  /(^|[\\/])cli[\\/]\.build-home([\\/]|$)/i,
  /credentials\.json$/i,
  /(^|[\\/])secrets([\\/]|$)/i,
  /tests[\\/]__baseline__[\\/]ab-/i,
  /tests[\\/]__baseline__[\\/]current-run/i,
  /tests[\\/]__baseline__[\\/]full-run\.log$/i,
];

const blocked = names.filter((p) => BLOCK_PATTERNS.some((re) => re.test(p.replace(/\\/g, "/"))));

const oversized = [];
for (const p of names) {
  try {
    const mb = statSync(p).size / (1024 * 1024);
    if (mb > MAX_MB) oversized.push({ p, mb: mb.toFixed(1) });
  } catch {
    /* path may be deleted or outside cwd */
  }
}

if (blocked.length) {
  console.error("verify-commit-scope: BLOCKED paths (must not commit):\n");
  for (const p of blocked) console.error(`  - ${p}`);
  process.exit(1);
}

if (oversized.length) {
  console.error(`verify-commit-scope: files over ${MAX_MB}MB (must not commit):\n`);
  for (const { p, mb } of oversized) console.error(`  - ${p} (${mb} MB)`);
  process.exit(1);
}

console.log(`verify-commit-scope: OK (${names.length} paths checked, 0 blocked)`);
