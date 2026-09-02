// Gate: compare vitest JSON against known-fails.txt (legacy) or A/B baseline JSON.
// Usage:
//   node tests/__baseline__/verify-no-regression.mjs <current-results.json> [repoRoot]
//   node tests/__baseline__/verify-no-regression.mjs --ab <baseline.json> <current.json> [repoRoot]
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  collectFailedIdentities,
  compareFailureSets,
} from "./test-identity.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(process.argv.includes("--ab")
  ? (process.argv[5] || process.cwd())
  : (process.argv[3] || process.cwd()));

function loadJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function runKnownFailsGate(currentPath) {
  const knownFails = new Set(
    readFileSync(resolve(here, "known-fails.txt"), "utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const r = loadJson(currentPath);
  const nowFails = collectFailedIdentities(r, repoRoot);
  const regressions = nowFails.filter((f) => !knownFails.has(f));

  if (regressions.length) {
    console.error(`\n❌ REGRESSION (known-fails gate): ${regressions.length} test(s) not in known-fails.txt:\n`);
    regressions.forEach((f) => console.error("  - " + f));
    process.exit(1);
  }
  console.log(`✅ No regression vs known-fails. (now fails=${nowFails.length}, baseline known=${knownFails.size})`);
}

function runAbCompare(baselinePath, currentPath) {
  const baselineJson = loadJson(baselinePath);
  const currentJson = loadJson(currentPath);

  const baselineFails = collectFailedIdentities(baselineJson, repoRoot);
  const currentFails = collectFailedIdentities(currentJson, repoRoot);
  const { unchanged, fixed, newFailures } = compareFailureSets(baselineFails, currentFails);

  console.log(JSON.stringify({
    baseline: {
      pass: baselineJson.numPassedTests,
      fail: baselineJson.numFailedTests,
      skip: baselineJson.numPendingTests,
      identities: baselineFails.length,
    },
    current: {
      pass: currentJson.numPassedTests,
      fail: currentJson.numFailedTests,
      skip: currentJson.numPendingTests,
      identities: currentFails.length,
    },
    unchanged: unchanged.length,
    fixed: fixed.length,
    new: newFailures.length,
    newFailures,
    fixedFailures: fixed,
  }, null, 2));

  if (newFailures.length) process.exit(1);
}

if (process.argv[2] === "--ab") {
  const baselinePath = process.argv[3];
  const currentPath = process.argv[4];
  if (!baselinePath || !currentPath) {
    console.error("Usage: verify-no-regression.mjs --ab <baseline.json> <current.json> [repoRoot]");
    process.exit(2);
  }
  runAbCompare(baselinePath, currentPath);
} else {
  const resultsPath = process.argv[2];
  if (!resultsPath) {
    console.error("Usage: verify-no-regression.mjs <current-results.json> [repoRoot]");
    process.exit(2);
  }
  runKnownFailsGate(resultsPath);
}
