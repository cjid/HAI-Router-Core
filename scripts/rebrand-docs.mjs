#!/usr/bin/env node
/**
 * Semantic HAI-Router documentation rebrand.
 * - Prose: 9Router → HAI-Router (never inside fenced code unless allowlisted)
 * - Code blocks: only verified literal substitutions (paths, clone URL, docker)
 * - Does NOT invent hairouter CLI/npm package names
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  ".tmp-build",
]);

/** @type {Array<[RegExp, string]>} — applied inside fenced code blocks only */
const CODE_REPLACEMENTS = [
  [/git clone https:\/\/github\.com\/decolua\/9router\.git/g, "git clone https://github.com/cjid/HAIRouter.git"],
  [/git clone https:\/\/github\.com\/decolua\/9router/g, "git clone https://github.com/cjid/HAIRouter"],
  [/cd 9router\/app\b/g, "cd HAIRouter"],
  [/cd 9router\b/g, "cd HAIRouter"],
  [/mkdir my-9router/g, "mkdir my-hairouter"],
  [/\$HOME\/\.9router/g, "$HOME/.hairouter"],
  [/~\/\.9router/g, "~/.hairouter"],
  [/%APPDATA%\\9router/g, "%APPDATA%\\hairouter"],
  [/export DATA_DIR="~\/\.9router"/g, 'export DATA_DIR="~/.hairouter"'],
  [/export DATA_DIR='~\/\.9router'/g, "export DATA_DIR='~/.hairouter'"],
  [/-v 9router-data:\/root\/\.9router/g, "-v hairouter-data:/app/data"],
  [/-v 9router-data:/g, "-v hairouter-data:"],
  [/docker pull decolua\/9router:latest/g, "# Build locally: docker build -t hairouter-app ."],
  [/docker pull 9router\/9router:latest/g, "# Build locally: docker build -t hairouter-app ."],
  [/decolua\/9router:latest/g, "hairouter-app:local"],
  [/9router\/9router:latest/g, "hairouter-app:local"],
  [/--name 9router\b/g, "--name hairouter"],
  [/docker logs -f 9router\b/g, "docker logs -f hairouter"],
  [/docker stop 9router\b/g, "docker stop hairouter"],
  [/docker start 9router\b/g, "docker start hairouter"],
  [/docker rm -f 9router\b/g, "docker rm -f hairouter"],
  [/9Router \(Smart Router\)/g, "HAI-Router (Smart Router)"],
  [/9Router（智能路由器）/g, "HAI-Router（智能路由器）"],
  [/9Router（スマートルーター）/g, "HAI-Router（スマートルーター）"],
  [/9Router \(Roteador inteligente\)/g, "HAI-Router (Roteador inteligente)"],
  [/9Router \(مسیریاب هوشمند\)/g, "HAI-Router (مسیریاب هوشمند)"],
  [/Client → 9Router →/g, "Client → HAI-Router →"],
  [/Cliente → 9Router →/g, "Cliente → HAI-Router →"],
  [/کلاینت → 9Router →/g, "کلاینت → HAI-Router →"],
  [/请求 → 9Router →/g, "请求 → HAI-Router →"],
  [/subgraph Router\[9Router/g, "subgraph Router[HAI-Router"],
  [/9Router - /g, "HAI-Router - "],
  [/9Router 的/g, "HAI-Router 的"],
  [/9Router 模型/g, "HAI-Router 模型"],
  [/任意 9Router/g, "任意 HAI-Router"],
  [/any 9Router/g, "any HAI-Router"],
  [/through 9Router/g, "through HAI-Router"],
  [/Check if 9Router/g, "Check if HAI-Router"],
  [/检查 9Router/g, "检查 HAI-Router"],
  [/启动 9Router/g, "启动 HAI-Router"],
  [/更新 9Router/g, "更新 HAI-Router"],
  [/Proxy to 9Router/g, "Proxy to HAI-Router"],
  [/PM2 启动 9Router/g, "PM2 启动 HAI-Router"],
  [/PM2 start 9router/g, "PM2 start 9router  # legacy CLI executable"],
  [/pm2 start 9router/g, "pm2 start 9router  # legacy CLI executable"],
  [/pkill -f 9router/g, "pkill -f 9router  # legacy CLI process name"],
  [/# Start 9Router/g, "# Start HAI-Router"],
  [/# Update 9Router/g, "# Update HAI-Router"],
  [/# Check 9Router/g, "# Check HAI-Router"],
  [/# Proxy to 9Router/g, "# Proxy to HAI-Router"],
  [/用 PM2 启动 9Router/g, "用 PM2 启动 HAI-Router"],
  [/若不使用反向代理,放开 9Router/g, "若不使用反向代理,放开 HAI-Router"],
  [/# 更新 9Router/g, "# 更新 HAI-Router"],
  [/# 检查 9Router/g, "# 检查 HAI-Router"],
  [/# Base URL for 9Router/g, "# Base URL for HAI-Router"],
  [/# API Key from 9Router/g, "# API Key from HAI-Router"],
  [/# API Key from 9Router dashboard/g, "# API Key from HAI-Router dashboard"],
  [/Request → 9Router →/g, "Request → HAI-Router →"],
  [/Solicitud → 9Router →/g, "Solicitud → HAI-Router →"],
  [/Model: cualquier modelo de 9Router/g, "Model: cualquier modelo de HAI-Router"],
  [/Model: any 9Router model/g, "Model: any HAI-Router model"],
  [/# Iniciar 9Router/g, "# Iniciar HAI-Router"],
  [/# Actualizar 9Router/g, "# Actualizar HAI-Router"],
  [/# Verificar si 9Router/g, "# Verificar si HAI-Router"],
  [/# Verifica si 9Router/g, "# Verifica si HAI-Router"],
  [/puertos de 9Router/g, "puertos de HAI-Router"],
  [/allow 9Router ports/g, "allow HAI-Router ports"],
  [/→ 9Router → provider/g, "→ HAI-Router → provider"],
  [/→ 9Router → provedor/g, "→ HAI-Router → provedor"],
  [/→ 9Router → fournisseur/g, "→ HAI-Router → fournisseur"],
  [/→ 9Router → ارائه‌دهنده/g, "→ HAI-Router → ارائه‌دهنده"],
  [/painel do 9Router/g, "painel do HAI-Router"],
  [/Base URL\n\n# 9Router/g, "Base URL\n\n# HAI-Router"],
  [/https:\/\/github\.com\/decolua\/9router\/issues/g, "https://github.com/cjid/HAIRouter/issues"],
  [/https:\/\/github\.com\/decolua\/9router\b/g, "https://github.com/cjid/HAIRouter"],
  [/github\.com\/decolua\/9router/g, "github.com/cjid/HAIRouter"],
];

/** @type {Array<[RegExp, string]>} — prose only (outside fences) */
const PROSE_REPLACEMENTS = [
  [/\bNineRouter\b/g, "HAI-Router"],
  [/\bnineRouter\b/g, "HAI-Router"],
  [/\b9ROUTER\b/g, "HAI-Router"],
  [/\b9Router\b/g, "HAI-Router"],
  [/Why 9Router\?/g, "Why HAI-Router?"],
  [/How 9Router Works/g, "How HAI-Router Works"],
  [/Install 9Router/g, "Install HAI-Router"],
  [/Update 9Router/g, "Update HAI-Router"],
  [/Starting 9Router/g, "Starting HAI-Router"],
  [/Run 9Router/g, "Run HAI-Router"],
  [/The 9Router /g, "The HAI-Router "],
  [/for 9Router/g, "for HAI-Router"],
  [/with 9Router/g, "with HAI-Router"],
  [/to 9Router/g, "to HAI-Router"],
  [/from 9Router/g, "from HAI-Router"],
  [/about 9Router/g, "about HAI-Router"],
  [/using 9Router/g, "using HAI-Router"],
  [/via 9Router/g, "via HAI-Router"],
  [/through 9Router/g, "through HAI-Router"],
  [/Welcome to 9Router/g, "Welcome to HAI-Router"],
  [/9Router is/g, "HAI-Router is"],
  [/9Router's/g, "HAI-Router's"],
  [/9Router dashboard/gi, "HAI-Router dashboard"],
  [/9Router provider/gi, "HAI-Router provider"],
  [/9Router server/gi, "HAI-Router server"],
  [/9Router image/gi, "HAI-Router image"],
  [/9Router CLI/gi, "HAI-Router"],
  [/9Router process/gi, "HAI-Router process"],
  [/9Router Local Process/g, "HAI-Router Local Process"],
  [/9Router Architecture/g, "HAI-Router Architecture"],
  [/9Router Hub/g, "HAI-Router Hub"],
  [/9Router \(/g, "HAI-Router ("],
  [/Issue: 9Router/g, "Issue: HAI-Router"],
  [/This repository package is private \(`9router-app`\)/g, "This repository package is private (`hairouter-app`)"],
  [/package\.json`, `9router-app`/g, "package.json`, `hairouter-app`"],
  [/Published image:.*decolua\/9router.*/g, "Build the image locally from this repository (no separate HAI-Router registry image is published yet)."],
  [/Published images:.*Docker Hub.*decolua\/9router.*/g, "Docker: build locally with `docker build -t hairouter-app .` (see DOCKER.md)."],
  [/Run 9Router in a container\. Published image.*/g, "Run HAI-Router in a container. Build the image locally from this repository."],
  [/Website\*\*: \[9router\.com\]/g, "Repository**: [github.com/cjid/HAIRouter]"],
  [/\[9router\.com\]\(https:\/\/9router\.com\)/g, "[github.com/cjid/HAIRouter](https://github.com/cjid/HAIRouter)"],
  [/9Router 本身/g, "HAI-Router 本身"],
  [/9Router 是/g, "HAI-Router 是"],
  [/9Router 会/g, "HAI-Router 会"],
  [/9Router 通过/g, "HAI-Router 通过"],
  [/9Router 使/g, "HAI-Router 使"],
  [/9Router 追踪/g, "HAI-Router 追踪"],
  [/9Router 的智能/g, "HAI-Router 的智能"],
  [/没有 9Router/g, "没有 HAI-Router"],
  [/有 9Router/g, "有 HAI-Router"],
  [/painel do 9Router/g, "painel do HAI-Router"],
];

function transformProse(text) {
  let out = text;
  for (const [re, rep] of PROSE_REPLACEMENTS) {
    out = typeof rep === "function" ? out.replace(re, rep) : out.replace(re, rep);
  }
  return out;
}

function transformCode(text) {
  let out = text;
  for (const [re, rep] of CODE_REPLACEMENTS) {
    out = out.replace(re, rep);
  }
  return out;
}

function processMarkdown(content) {
  const lines = content.split("\n");
  const out = [];
  let inFence = false;
  let fenceLang = "";

  for (const line of lines) {
    const fenceMatch = line.match(/^(`{3,}|~{3,})(\w*)/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceLang = fenceMatch[2] || "";
      } else {
        inFence = false;
        fenceLang = "";
      }
      out.push(line);
      continue;
    }

    if (inFence) {
      out.push(transformCode(line));
    } else {
      out.push(transformProse(line));
    }
  }

  return out.join("\n");
}

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(md|mdx)$/i.test(ent.name)) files.push(p);
  }
  return files;
}

const files = walk(ROOT);
let changed = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const original = fs.readFileSync(file, "utf8");
  let next = processMarkdown(original);

  // Attribution footer injection for README variants (once)
  if (/^README(\.|$)/.test(path.basename(file)) && !next.includes("based on the original 9Router")) {
    if (rel === "README.md" || rel.startsWith("i18n/README")) {
      const attribution = "\n\n---\n\n*HAI-Router is based on the original [9Router](https://github.com/decolua/9router) project. The legacy npm CLI package identifier remains `9router` for compatibility.*\n";
      if (!next.includes("original 9Router") && !next.includes("original [9Router]")) {
        next = next.trimEnd() + attribution;
      }
    }
  }

  if (next !== original) {
    fs.writeFileSync(file, next);
    changed++;
    console.log("updated", rel);
  }
}

console.log(`done: ${changed}/${files.length} files changed`);
