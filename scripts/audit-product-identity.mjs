#!/usr/bin/env node
/**
 * Audit remaining 9Router identity strings in source.
 * Allowed: LEGACY_COMPATIBILITY, FOOTER_ATTRIBUTION, TEST_FIXTURE, HISTORICAL_DOC (comments)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PATTERN = /9router|9Router|9ROUTER|nineRouter|NINE_ROUTER|router9|__9router/g;

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "coverage", "tests/__baseline__",
]);

const ALLOWED_FILES = new Set([
  "src/shared/constants/product.js",
  "src/shared/constants/cliIdentity.js",
  "src/shared/constants/credits.js",
  "src/shared/components/FooterAttribution.js",
  "src/lib/dataDir.js",
  "src/lib/dataDirCore.cjs",
  "src/mitm/paths.js",
  "src/mitm/cert/install.js",
  "src/mitm/cert/rootCA.js",
  "src/mitm/manager.js",
  "open-sse/shared/runtimeGlobals.js",
  "open-sse/config/runtimeConfig.js",
  "src/lib/grokBuildConfig.js",
  "scripts/audit-product-identity.mjs",
  "scripts/sync-hairouter-i18n.mjs",
  "scripts/sync-upstream.mjs",
  "tests/unit/product-identity.test.js",
  "COMPATIBILITY.md",
  "cli/README.md",
  "cli/package.json",
  "cli/cli.js",
]);

const FOOTER_FILES = new Set([
  "src/shared/components/DashboardFooter.js",
  "src/app/landing/components/Footer.js",
  "src/shared/components/FooterAttribution.js",
]);

const DOC_FILES = new Set([
  "README.md", "ARCHITECTURE.md", "DEVELOPMENT.md", "DOCKER.md", "SECURITY.md",
  "CHANGELOG.md", "CLAUDE.md", "COMPATIBILITY.md", "docs/ARCHITECTURE.md",
  "docs/GO_ENGINE.md", "docs/PROVIDER_SAFETY.md", "docs/USAGE_AND_OBSERVABILITY.md",
]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs|ts|tsx|json|md|yml|yaml|env\.example)$/.test(ent.name)) out.push(full);
  }
  return out;
}

function classify(rel, line, lineNo) {
  const norm = rel.replace(/\\/g, "/");
  if (FOOTER_FILES.has(norm)) return "FOOTER_ATTRIBUTION";
  if (ALLOWED_FILES.has(norm)) return "LEGACY_COMPATIBILITY";
  if (norm.startsWith("tests/")) return "TEST_FIXTURE";
  if (/legacy|LEGACY|migration|migrat|upstream|attribution|compat|has9Router|hasHairouter/i.test(line)) return "LEGACY_COMPATIBILITY";
  if (/^\s*(\/\/|\*|#)/.test(line)) return "HISTORICAL_DOC";
  if (/\b9[Rr]outer\b/.test(line) && /\/\/|\*\/|\/\*/.test(line)) return "HISTORICAL_DOC";
  if (norm.startsWith("cli/")) return "LEGACY_COMPATIBILITY";
  if (DOC_FILES.has(norm)) return "HISTORICAL_DOC";
  if (norm.startsWith("public/i18n/literals/")) return "I18N_LITERAL";
  if (norm.startsWith("skills/")) return "OUT_OF_SCOPE";
  return "ACTIVE_IDENTIFIER";
}

const files = walk(ROOT);
const hits = [];

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (!PATTERN.test(line)) return;
    PATTERN.lastIndex = 0;
    const category = classify(rel, line, i + 1);
    hits.push({ rel, line: i + 1, category, snippet: line.trim().slice(0, 120) });
  });
}

const active = hits.filter((h) => h.category === "ACTIVE_IDENTIFIER");
const grouped = Object.groupBy(hits, (h) => h.category);

console.log("=== HAI-Router Product Identity Audit ===\n");
for (const [cat, items] of Object.entries(grouped)) {
  console.log(`## ${cat} (${items.length})`);
  for (const item of items.slice(0, 50)) {
    console.log(`  ${item.rel}:${item.line}  ${item.snippet}`);
  }
  if (items.length > 50) console.log(`  ... and ${items.length - 50} more`);
  console.log("");
}

console.log(`ACTIVE_IDENTIFIER total: ${active.length}`);
process.exit(active.length > 0 ? 1 : 0);
