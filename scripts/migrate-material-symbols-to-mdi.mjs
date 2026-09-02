#!/usr/bin/env node
/**
 * One-shot codemod: material-symbols-outlined spans → <MdiIcon name="…" />.
 * Run: node scripts/migrate-material-symbols-to-mdi.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

const SIZE_CLASS_MAP = {
  "text-[10px]": 10,
  "text-[11px]": 11,
  "text-[13px]": 13,
  "text-[14px]": 14,
  "text-[16px]": 16,
  "text-[18px]": 18,
  "text-[20px]": 20,
  "text-[24px]": 24,
  "text-[28px]": 28,
  "text-[32px]": 32,
  "text-xs": 12,
  "text-sm": 14,
  "text-base": 16,
  "text-lg": 18,
  "text-xl": 20,
  "text-2xl": 24,
  "text-3xl": 30,
};

const STRIP_CLASSES = new Set([
  "material-symbols-outlined",
  "leading-none",
  "fill-1",
  ...Object.keys(SIZE_CLASS_MAP),
]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function parseSize(className, styleAttr) {
  for (const [cls, px] of Object.entries(SIZE_CLASS_MAP)) {
    if (className.includes(cls)) return px;
  }
  if (styleAttr) {
    const m = styleAttr.match(/fontSize:\s*[`'"]?(\d+)/);
    if (m) return Number(m[1]);
  }
  return 18;
}

function cleanClassName(className) {
  return className
    .split(/\s+/)
    .filter((c) => c && !STRIP_CLASSES.has(c) && !c.startsWith("material-symbols"))
    .join(" ");
}

function ensureImport(source) {
  if (source.includes('from "@/shared/components/MdiIcon"')
    || source.includes("from '@/shared/components/MdiIcon'")) {
    return source;
  }
  const importLine = 'import MdiIcon from "@/shared/components/MdiIcon";\n';
  if (source.startsWith('"use client"') || source.startsWith("'use client'")) {
    const nl = source.indexOf("\n");
    return `${source.slice(0, nl + 1)}\n${importLine}${source.slice(nl + 1)}`;
  }
  return `${importLine}${source}`;
}

const SPAN_RE = /<span\s+className="([^"]*)"\s*(?:style=\{([^}]+)\})?\s*>([a-z0-9_]+)<\/span>/g;

function migrateFile(filePath) {
  let src = fs.readFileSync(filePath, "utf8");
  if (!src.includes("material-symbols-outlined")) return false;

  let changed = false;
  src = src.replace(SPAN_RE, (full, className, styleAttr, iconName) => {
    if (!className.includes("material-symbols-outlined")) return full;
    changed = true;
    const size = parseSize(className, styleAttr);
    const spin = className.includes("animate-spin");
    const rest = cleanClassName(className);
    const parts = [`name="${iconName}"`, `size={${size}}`];
    if (spin) parts.push("spin");
    if (rest) parts.push(`className="${rest}"`);
    return `<MdiIcon ${parts.join(" ")} />`;
  });

  if (!changed) return false;
  src = ensureImport(src);
  fs.writeFileSync(filePath, src);
  return true;
}

let count = 0;
for (const file of walk(SRC)) {
  if (migrateFile(file)) {
    count += 1;
    console.log("migrated:", path.relative(ROOT, file));
  }
}
console.log(`Done. ${count} files updated.`);
