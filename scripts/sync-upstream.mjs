#!/usr/bin/env node
/**
 * Merge upstream 9router into this HAI-Router fork.
 * Custom patches live in git history on origin/master — merge preserves them
 * (resolve conflicts manually when upstream touches the same files).
 *
 * Usage: node scripts/sync-upstream.mjs [--push]
 */

import { execSync } from "node:child_process";

const UPSTREAM_REMOTE = "upstream";
const UPSTREAM_BRANCH = "master";
const PUSH = process.argv.includes("--push");

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: "inherit", encoding: "utf8", ...opts });
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function ensureUpstreamRemote() {
  try {
    runCapture(`git remote get-url ${UPSTREAM_REMOTE}`);
  } catch {
    console.error(`Remote "${UPSTREAM_REMOTE}" not found. Add it with:`);
    console.error("  git remote add upstream https://github.com/decolua/9router.git");
    process.exit(1);
  }
}

function main() {
  ensureUpstreamRemote();

  const branch = runCapture("git rev-parse --abbrev-ref HEAD");
  if (branch !== "master" && branch !== "main") {
    console.warn(`Warning: not on master/main (on ${branch}). Continue anyway.`);
  }

  console.log("→ Fetching upstream 9router…");
  run(`git fetch ${UPSTREAM_REMOTE} ${UPSTREAM_BRANCH}`);

  const upstreamHead = runCapture(`git rev-parse ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`);
  const mergeBase = runCapture(`git merge-base HEAD ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`);

  if (upstreamHead === mergeBase) {
    console.log("Already up to date with upstream.");
    return;
  }

  console.log(`→ Merging ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} (patches on this branch are kept via git merge)…`);
  try {
    run(`git merge ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} -m "chore(upstream): sync 9router ${upstreamHead.slice(0, 7)}"`);
  } catch {
    console.error("\nMerge stopped with conflicts.");
    console.error("Resolve conflicts (keep HAI-Router customizations), then:");
    console.error("  git add -A && git commit");
    console.error("  git push origin HEAD");
    process.exit(1);
  }

  console.log("\n✓ Upstream merged. Run tests, then push to origin so dashboard updates pick up the new build.");
  console.log("  cd tests && npx vitest run --config vitest.config.js");
  console.log("  node tests/__baseline__/verify-no-regression.mjs");

  if (PUSH) {
    console.log("→ Pushing to origin…");
    run("git push origin HEAD");
  } else {
    console.log("\nTip: push with  node scripts/sync-upstream.mjs --push");
  }
}

main();
