#!/usr/bin/env node
/**
 * Audit CLI Tools UI strings against zh-CN literals.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const literals = JSON.parse(
  fs.readFileSync(path.join(root, "public/i18n/literals/zh-CN.json"), "utf8")
);
const keys = new Set(Object.keys(literals));

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name.endsWith(".js")) files.push(p);
  }
  return files;
}

const stringRe = />([^<>{}][^<>{}\n]{2,120})</g;
const quoteRe = /"(?:[^"\\]|\\.){4,200}"/g;
const found = new Set();

for (const file of walk(path.join(root, "src/app/(dashboard)/dashboard/cli-tools"))) {
  const src = fs.readFileSync(file, "utf8");
  let m;
  while ((m = stringRe.exec(src))) {
    const s = m[1].trim();
    if (/^[a-z_]+$/.test(s)) continue;
    if (/^[\d./:?#-]+$/.test(s)) continue;
    if (s.includes("${")) continue;
    found.add(s);
  }
}

const cliToolsSrc = fs.readFileSync(path.join(root, "src/shared/constants/cliTools.js"), "utf8");
for (const m of cliToolsSrc.matchAll(/text:\s*"([^"]+)"/g)) found.add(m[1]);
for (const m of cliToolsSrc.matchAll(/desc:\s*"([^"]+)"/g)) found.add(m[1]);
for (const m of cliToolsSrc.matchAll(/title:\s*"([^"]+)"/g)) found.add(m[1]);
for (const m of cliToolsSrc.matchAll(/description:\s*"([^"]+)"/g)) found.add(m[1]);

const missing = [...found].filter((s) => !keys.has(s)).sort();
console.log(`checked ${found.size} strings, missing ${missing.length}:`);
for (const s of missing) console.log(`- ${s}`);
