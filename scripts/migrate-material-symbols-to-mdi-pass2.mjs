#!/usr/bin/env node
/**
 * Pass 2: dynamic icons, template classNames, cn() spans.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

const SIZE_CLASS_MAP = {
  "text-[10px]": 10, "text-[11px]": 11, "text-[12px]": 12, "text-[13px]": 13,
  "text-[14px]": 14, "text-[15px]": 15, "text-[16px]": 16, "text-[18px]": 18,
  "text-[20px]": 20, "text-[22px]": 22, "text-[24px]": 24, "text-[26px]": 26,
  "text-[28px]": 28, "text-[32px]": 32, "text-[64px]": 64,
  "text-xs": 12, "text-sm": 14, "text-base": 16, "text-lg": 18,
  "text-xl": 20, "text-2xl": 24, "text-3xl": 30,
};

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function parseSize(className) {
  for (const [cls, px] of Object.entries(SIZE_CLASS_MAP)) {
    if (className.includes(cls)) return px;
  }
  return 18;
}

function cleanClassName(className) {
  return className
    .split(/\s+/)
    .filter((c) => c && c !== "material-symbols-outlined" && c !== "leading-none" && c !== "fill-1"
      && !SIZE_CLASS_MAP[c] && !c.startsWith("material-symbols"))
    .join(" ");
}

function ensureImport(source) {
  if (source.includes("@/shared/components/MdiIcon")) return source;
  const importLine = 'import MdiIcon from "@/shared/components/MdiIcon";\n';
  if (source.startsWith('"use client"') || source.startsWith("'use client'")) {
    const nl = source.indexOf("\n");
    return `${source.slice(0, nl + 1)}\n${importLine}${source.slice(nl + 1)}`;
  }
  return `${importLine}${source}`;
}

function buildMdi(iconExpr, className, spin = false) {
  const size = parseSize(className);
  const rest = cleanClassName(className);
  const parts = [`name={${iconExpr}}`, `size={${size}}`];
  if (spin || className.includes("animate-spin")) parts.push("spin");
  if (rest) parts.push(`className="${rest}"`);
  return `<MdiIcon ${parts.join(" ")} />`;
}

function migrateFile(filePath) {
  let src = fs.readFileSync(filePath, "utf8");
  if (!src.includes("material-symbols-outlined")) return false;
  const before = src;

  // Dynamic: {iconVar}
  src = src.replace(
    /<span\s+className="([^"]*material-symbols-outlined[^"]*)"\s*(?:style=\{[^}]+\})?\s*>\{([^}]+)\}<\/span>/g,
    (_, cls, expr) => buildMdi(expr, cls),
  );

  // Template literal class, static icon
  src = src.replace(
    /<span\s+className=\{`([^`]*material-symbols-outlined[^`]*)`\}\s*(?:style=\{[^}]+\})?\s*>([a-z0-9_]+)<\/span>/g,
    (_, cls, icon) => buildMdi(`"${icon}"`, cls),
  );

  // Template literal class, dynamic icon
  src = src.replace(
    /<span\s+className=\{`([^`]*material-symbols-outlined[^`]*)`\}\s*>\{([^}]+)\}<\/span>/g,
    (_, cls, expr) => buildMdi(expr, cls),
  );

  // Ternary in children: {cond ? "a" : "b"}
  src = src.replace(
    /<span\s+className="([^"]*material-symbols-outlined[^"]*)"\s*>\{([^}]+\?[^}]+\:[^}]+)\}<\/span>/g,
    (_, cls, expr) => buildMdi(expr, cls),
  );

  // Multiline span with static icon (common in modals)
  src = src.replace(
    /<span\s+className="([^"]*material-symbols-outlined[^"]*)"\s*>\s*\n\s*([a-z0-9_]+)\s*\n\s*<\/span>/g,
    (_, cls, icon) => buildMdi(`"${icon}"`, cls),
  );

  if (src === before) return false;
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
console.log(`Pass 2 done. ${count} files updated.`);
