import { relative, resolve, sep } from "path";

/**
 * Canonical vitest failure identity: tests/<path>::<fullName>
 * Portable across Windows, Linux, Docker, and absolute checkout paths.
 */
export function normalizeTestFilePath(filePath, repoRoot) {
  if (!filePath || typeof filePath !== "string") return "";
  const root = resolve(repoRoot || process.cwd());
  let normalized = filePath.replace(/\\/g, "/");

  if (/^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("/")) {
    try {
      normalized = relative(root, resolve(normalized)).replace(/\\/g, "/");
    } catch {
      // keep as-is
    }
  }

  normalized = normalized.replace(/^\.?\//, "");

  const testsIdx = normalized.indexOf("/tests/");
  if (testsIdx >= 0) {
    normalized = normalized.slice(testsIdx + 1);
  } else if (normalized.startsWith("tests/")) {
    // already relative
  }

  return normalized.split(sep).join("/");
}

export function testFailureIdentity(filePath, fullName, repoRoot) {
  const rel = normalizeTestFilePath(filePath, repoRoot);
  const name = String(fullName || "").trim();
  return `${rel} :: ${name}`;
}

export function collectFailedIdentities(vitestJson, repoRoot) {
  const fails = [];
  for (const file of vitestJson.testResults || []) {
    if (!file?.assertionResults?.length) continue;
    for (const assertion of file.assertionResults) {
      if (assertion.status === "failed") {
        fails.push(testFailureIdentity(file.name, assertion.fullName, repoRoot));
      }
    }
  }
  return fails.sort();
}

export function compareFailureSets(baselineFails, currentFails) {
  const baseline = new Set(baselineFails);
  const current = new Set(currentFails);
  const unchanged = [];
  const fixed = [];
  const newFailures = [];

  for (const id of baseline) {
    if (current.has(id)) unchanged.push(id);
    else fixed.push(id);
  }
  for (const id of current) {
    if (!baseline.has(id)) newFailures.push(id);
  }

  return {
    unchanged: unchanged.sort(),
    fixed: fixed.sort(),
    newFailures: newFailures.sort(),
  };
}
