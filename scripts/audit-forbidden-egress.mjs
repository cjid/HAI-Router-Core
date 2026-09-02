#!/usr/bin/env node
/**
 * Repo-wide forbidden provider egress audit.
 * FAIL if any provider-facing Node network primitive remains outside documented allowlist.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

const root = join(fileURLToPath(import.meta.url), "..", "..");

/** path → classification reason (non-provider) */
const ALLOWLIST = new Map([
  ["open-sse/rtk/headroom.js", "C: user-configured RTK compress proxy, fail-open"],
  ["open-sse/translator/concerns/image.js", "E: SSRF-guarded translation prefetch"],
  ["open-sse/shared/qoder/cosy.js", "F: JSDoc only"],
  ["open-sse/utils/proxyFetch.js", "B: defines originalFetch + Go IPC localhost"],
  ["open-sse/utils/http2Connect.js", "F: legacy opt-out only when HAI_GO_ENGINE=0"],
  ["open-sse/executors/cursor.js", "F: legacy Node h2 branch when Go disabled"],
  ["open-sse/services/cursorModels.js", "F: legacy Node h2 branch when Go disabled"],
  ["src/lib/goEngine/goTransport.js", "B: localhost Go IPC"],
  ["src/lib/goEngine/goEngineHttp2.js", "B: localhost Go IPC"],
  ["src/lib/goEngine/goEngineManager.js", "B: localhost worker health/version"],
  ["src/lib/providerFetch.js", "B: facade to Go transport"],
  ["src/app/api/models/test/ping.js", "B: loopback HAI internal API self-test"],
  ["src/app/api/providers/[id]/test-models/route.js", "B: loopback internal models API"],
  ["src/app/api/v1/audio/voices/route.js", "B: loopback internal media-providers API"],
  ["src/app/api/headroom/proxy/[...path]/route.js", "C: user Headroom compress proxy dashboard"],
  ["src/app/api/cli-tools/cowork-mcp-registry/route.js", "C: user-configured MCP registry URL"],
  ["src/app/api/cli-tools/cowork-mcp-tools/route.js", "C: user-configured MCP server URL"],
  ["src/app/api/proxy-pools/cloudflare-deploy/route.js", "D: Cloudflare control-plane deploy"],
  ["src/app/api/proxy-pools/deno-deploy/route.js", "D: Deno control-plane deploy"],
  ["src/app/api/proxy-pools/vercel-deploy/route.js", "D: Vercel control-plane deploy"],
]);

const SCAN_DIRS = ["open-sse", join("src", "lib", "oauth"), join("src", "sse"), join("src", "app", "api")];

const PRIMITIVE_RES = [
  { name: "fetch(", re: /\bfetch\s*\(/ },
  { name: "globalThis.fetch", re: /globalThis\.fetch\s*\(/ },
  { name: "originalFetch(", re: /\boriginalFetch\s*\(/ },
  { name: "undici", re: /\bundici\b/ },
  { name: "http.request", re: /\bhttp\.request\s*\(/ },
  { name: "https.request", re: /\bhttps\.request\s*\(/ },
  { name: "http2.connect", re: /\bhttp2\.connect\s*\(/ },
  { name: "connectHttp2Client", re: /\bconnectHttp2Client\s*\(/ },
  { name: "net.connect", re: /\bnet\.connect\s*\(/ },
  { name: "tls.connect", re: /\btls\.connect\s*\(/ },
  { name: "ProxyAgent", re: /\bProxyAgent\b/ },
  { name: "WebSocket(", re: /\bnew\s+WebSocket\s*\(/ },
];

const SAFE_LINE_RE = /proxyAwareFetch|providerFetch|modalityFetch|oauthFetch|goEngineFetch|goEngineOpenHttp2Stream|isGoEngineEnabled|127\.0\.0\.1|localhost|\/api\/cli\/providers\/|async fetch\(request, env/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function isInternalFetch(line) {
  return /fetch\s*\(\s*[`'"]\//.test(line)
    || /fetch\s*\(\s*[`'"]https?:\/\/(localhost|127\.0\.0\.1)/.test(line);
}

const violations = [];
const classified = [];

for (const scanRel of SCAN_DIRS) {
  const scanDir = join(root, scanRel);
  try { statSync(scanDir); } catch { continue; }
  for (const file of walk(scanDir)) {
    const rel = relative(root, file).replace(/\\/g, "/");
    const allowReason = ALLOWLIST.get(rel);
    if (allowReason) {
      classified.push({ file: rel, reason: allowReason });
      continue;
    }
    const src = readFileSync(file, "utf8");
    if (/oauthFetch\s+as\s+fetch/.test(src)) continue;
    const lines = src.split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const { name, re } of PRIMITIVE_RES) {
        if (!re.test(line)) continue;
        if (isCommentLine(line)) continue;
        if (SAFE_LINE_RE.test(line)) continue;
        if (name === "fetch(" && isInternalFetch(line)) continue;
        if (name === "originalFetch(" && /127\.0\.0\.1|localhost|worker\.baseUrl/.test(line)) continue;
        violations.push({ file: rel, line: idx + 1, primitive: name, text: line.trim().slice(0, 120) });
      }
    });
  }
}

if (violations.length) {
  console.error(`[audit-forbidden-egress] FAIL: ${violations.length} provider-facing Node primitive(s)\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} [${v.primitive}] ${v.text}`);
  }
  process.exit(1);
}

console.log(`[audit-forbidden-egress] PASS: 0 provider-facing Node egress`);
console.log(`[audit-forbidden-egress] classified non-provider allowlist: ${classified.length} path(s)`);
for (const c of classified) {
  console.log(`  ${c.file} — ${c.reason}`);
}
process.exit(0);
