#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MDI_ICON_REGISTRY } from "../src/shared/icons/mdiIconRegistry.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const keySet = new Set(Object.keys(MDI_ICON_REGISTRY));

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const missing = new Set();
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/name="([a-z0-9_]+)"/g)) {
    if (!keySet.has(m[1])) missing.add(m[1]);
  }
}

const legacy = [];
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, "utf8");
  if (src.includes("material-symbols")) legacy.push(path.relative(ROOT, file));
}

console.log("Registry icons:", keySet.size);
console.log("Static names missing from registry:", [...missing].sort().join(", ") || "none");
console.log("Legacy material-symbols files:", legacy.length ? legacy.join("\n") : "none");

if (missing.size || legacy.length) process.exit(1);
