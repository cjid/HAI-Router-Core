#!/usr/bin/env node
/**
 * Copy verified working tree to a fresh sibling repo with hash manifest verification.
 * Does NOT modify source .git.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST = path.resolve(SRC, "..", "HAIRouter-Core");

const EXCLUDE_DIRS = new Set([
  ".git", "node_modules", ".next", "coverage", "dist", "build",
  ".tmp-build", ".turbo", ".cache", "logs",
]);

const EXCLUDE_FILES = new Set([
  ".env",
  ".tmp-icon-names.txt",
]);

function shouldSkip(rel) {
  const parts = rel.split(/[/\\]/);
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;
  if (EXCLUDE_FILES.has(path.basename(rel))) return true;
  return false;
}

function walk(root, base = root, out = []) {
  for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
    const full = path.join(base, ent.name);
    const rel = path.relative(root, full).replace(/\\/g, "/");
    if (shouldSkip(rel)) continue;
    if (ent.isDirectory()) walk(root, full, out);
    else out.push(rel);
  }
  return out;
}

function hashFile(abs) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(abs));
  return h.digest("hex");
}

function copyTree() {
  if (fs.existsSync(DEST)) {
    console.error(`Destination exists: ${DEST} — remove manually or pick another path.`);
    process.exit(1);
  }
  fs.mkdirSync(DEST, { recursive: true });
  const files = walk(SRC);
  for (const rel of files) {
    const srcFile = path.join(SRC, rel);
    const destFile = path.join(DEST, rel);
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.copyFileSync(srcFile, destFile);
  }
  return files;
}

function manifest(root, files) {
  const m = {};
  for (const rel of files.sort()) {
    m[rel] = hashFile(path.join(root, rel));
  }
  return m;
}

const files = copyTree();
const srcManifest = manifest(SRC, files);
const destManifest = manifest(DEST, files);

let mismatches = 0;
for (const rel of Object.keys(srcManifest)) {
  if (srcManifest[rel] !== destManifest[rel]) {
    console.error(`HASH MISMATCH: ${rel}`);
    mismatches += 1;
  }
}

const report = {
  source: SRC,
  dest: DEST,
  fileCount: files.length,
  mismatches,
  createdAt: new Date().toISOString(),
};

fs.writeFileSync(path.join(DEST, ".fresh-snapshot-manifest.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(SRC, "..", "HAIRouter-Core-manifest.json"), JSON.stringify({ ...report, hashes: srcManifest }, null, 2));

console.log(JSON.stringify(report, null, 2));
if (mismatches > 0) process.exit(1);
