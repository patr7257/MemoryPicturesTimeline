#!/usr/bin/env node
// Writes build-info.json ({ sha, builtAt }) during the Docker build, so the
// running app knows WHICH commit it was built from. The page version gate
// (src/lib/use-app-version-gate.ts) compares that with /version.json and
// offers a reload when a newer build is live. Ported from the app-shell and
// deploy-dokploy blocks of zrm-fullstack-building-blocks.
//
// Dokploy passes no commit into a build, but its clone is a real git checkout,
// so .git is readable when the build context is the repository root. Node
// reads it directly because the node image ships without git.
//
// Precedence:
//   1. the GIT_SHA build argument, only as a full 40 character hex sha,
//      lower-cased. A short or malformed value is ignored: a wrong sha that
//      looks right is worse than "unknown";
//   2. .git: HEAD, then the loose ref it names, then packed-refs;
//   3. "unknown", which switches the version gate off.
//
// It never fails the build.
//
// Usage, from the build context root: node scripts/build-info.mjs /tmp/build-info.json

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA = /^[0-9a-f]{40}$/;

/** The commit .git points at, or null when it cannot be read. Handles loose and packed refs. */
export function shaFromGitDir(gitDir) {
  try {
    if (!existsSync(gitDir) || !statSync(gitDir).isDirectory()) return null;
    const head = readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (SHA.test(head)) return head;
    const ref = /^ref:\s*(\S+)$/.exec(head)?.[1];
    if (!ref) return null;
    const loose = path.join(gitDir, ref);
    if (existsSync(loose)) {
      const sha = readFileSync(loose, "utf8").trim();
      return SHA.test(sha) ? sha : null;
    }
    const packed = path.join(gitDir, "packed-refs");
    if (!existsSync(packed)) return null;
    for (const line of readFileSync(packed, "utf8").split(/\r?\n/)) {
      const [sha, name] = line.split(" ");
      if (name === ref && SHA.test(sha)) return sha;
    }
    return null;
  } catch {
    return null;
  }
}

/** The build info for this build. `env.GIT_SHA` wins only when it is a full sha. */
export function buildInfo({ env = process.env, gitDir = ".git", now = new Date() } = {}) {
  const fromArg = String(env.GIT_SHA ?? "").trim().toLowerCase();
  const sha = SHA.test(fromArg) ? fromArg : (shaFromGitDir(gitDir) ?? "unknown");
  return { sha, builtAt: now.toISOString() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2];
  if (!out) {
    console.error("Usage: node scripts/build-info.mjs <output.json>");
    process.exit(1);
  }
  const info = buildInfo();
  writeFileSync(out, `${JSON.stringify(info)}\n`, { encoding: "utf8" });
  console.log(`build-info: sha ${info.sha}, built ${info.builtAt}`);
}
