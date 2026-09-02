#!/usr/bin/env node
/**
 * Cross-platform Go worker build script.
 * Requires Go >= 1.22 (PATH or common install locations on Windows).
 *
 * Usage:
 *   node scripts/build-go-engine.mjs          # host platform
 *   node scripts/build-go-engine.mjs --all    # linux/darwin/windows amd64+arm64
 */
import { spawnSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const engineDir = join(root, "go-engine");
const outDir = join(engineDir, "bin");
mkdirSync(outDir, { recursive: true });

const buildAll = process.argv.includes("--all");

const PLATFORM_MATRIX = [
  { goos: "linux", goarch: "amd64", suffix: "linux-amd64" },
  { goos: "linux", goarch: "arm64", suffix: "linux-arm64" },
  { goos: "darwin", goarch: "amd64", suffix: "darwin-amd64" },
  { goos: "darwin", goarch: "arm64", suffix: "darwin-arm64" },
  { goos: "windows", goarch: "amd64", suffix: "windows-amd64.exe" },
  { goos: "windows", goarch: "arm64", suffix: "windows-arm64.exe" },
];

function resolveGoBinary() {
  const fromPath = spawnSync(process.platform === "win32" ? "where" : "which", ["go"], { encoding: "utf8" });
  if (fromPath.status === 0) {
    const line = fromPath.stdout.split(/\r?\n/).find(Boolean);
    if (line && existsSync(line.trim())) return line.trim();
  }
  if (process.platform === "win32") {
    const candidates = [
      join(process.env.ProgramFiles || "C:\\Program Files", "Go", "bin", "go.exe"),
      join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Go", "bin", "go.exe"),
      "D:\\Program Files\\Go\\bin\\go.exe",
      join(process.env.LOCALAPPDATA || "", "Programs", "Go", "bin", "go.exe"),
      "C:\\Go\\bin\\go.exe",
    ];
    for (const c of candidates) {
      if (c && existsSync(c)) return c;
    }
  }
  return "go";
}

const goBin = resolveGoBinary();
console.log(`[build-go-engine] using ${goBin}`);

function buildOne({ goos, goarch, suffix } = {}) {
  const outPath = suffix
    ? join(outDir, `hai-worker-${suffix}`)
    : join(outDir, process.platform === "win32" ? "hai-worker.exe" : "hai-worker");

  const env = { ...process.env };
  if (suffix) {
    env.GOOS = goos;
    env.GOARCH = goarch;
    env.CGO_ENABLED = "0";
  }

  const build = spawnSync(goBin, ["build", "-o", outPath, "./cmd/worker"], {
    cwd: engineDir,
    stdio: "inherit",
    env,
  });

  if (build.error || build.status !== 0) {
    console.error(`[build-go-engine] build failed for ${suffix || "host"}`);
    process.exit(build.status ?? 1);
  }
  console.log(`[build-go-engine] wrote ${outPath}`);
}

if (buildAll) {
  for (const p of PLATFORM_MATRIX) buildOne(p);
} else {
  buildOne({});
}

process.exit(0);
