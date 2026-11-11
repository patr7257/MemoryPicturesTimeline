// Tests for scripts/build-info.mjs. Run: node --test scripts/build-info.test.mjs
//
// Each case pins a way the stamped commit could lie or break a build: a branch
// whose ref only lives in packed-refs (a fresh shallow clone packs them), a
// worktree whose .git is a file, a short sha passed as a build argument, and
// the rule that nothing readable still builds.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildInfo, shaFromGitDir } from "./build-info.mjs";

const A = "a".repeat(40);
const B = "b".repeat(40);
// An explicit UTC instant, so the assertion does not depend on the runner's clock or zone.
const NOW = new Date(Date.UTC(2026, 9, 2, 12, 0, 0));
const SCRIPT = fileURLToPath(new URL("./build-info.mjs", import.meta.url));
const MISSING = path.join(os.tmpdir(), "no-such-git-dir-build-info");

const made = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "build-info-"));
  made.push(dir);
  return dir;
}

function gitDir(files) {
  const dir = tempDir();
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test("a branch HEAD resolves through its loose ref", () => {
  const dir = gitDir({ HEAD: "ref: refs/heads/main\n", "refs/heads/main": `${A}\n` });
  assert.equal(shaFromGitDir(dir), A);
});

test("a branch HEAD resolves through packed-refs when there is no loose ref", () => {
  const dir = gitDir({
    HEAD: "ref: refs/heads/main\n",
    "packed-refs": `# pack-refs with: peeled\n${B} refs/heads/other\n${A} refs/heads/main\n`,
  });
  assert.equal(shaFromGitDir(dir), A);
});

test("a detached HEAD is the sha itself", () => {
  assert.equal(shaFromGitDir(gitDir({ HEAD: `${B}\n` })), B);
});

test("no .git, a .git FILE (a worktree) or an unknown ref yields null, never a guess", () => {
  assert.equal(shaFromGitDir(MISSING), null);
  const file = path.join(tempDir(), ".git");
  fs.writeFileSync(file, "gitdir: /somewhere/else\n");
  assert.equal(shaFromGitDir(file), null);
  assert.equal(shaFromGitDir(gitDir({ HEAD: "ref: refs/heads/gone\n" })), null);
  assert.equal(
    shaFromGitDir(gitDir({ HEAD: "ref: refs/heads/main\n", "refs/heads/main": "not-a-sha\n" })),
    null,
  );
});

test("the GIT_SHA build argument wins over .git, and is lower-cased", () => {
  const dir = gitDir({ HEAD: `${A}\n` });
  assert.deepEqual(buildInfo({ env: { GIT_SHA: B.toUpperCase() }, gitDir: dir, now: NOW }), {
    sha: B,
    builtAt: "2026-10-02T12:00:00.000Z",
  });
});

test("a short or malformed GIT_SHA is ignored in favour of .git", () => {
  const dir = gitDir({ HEAD: `${A}\n` });
  assert.equal(buildInfo({ env: { GIT_SHA: "abc1234" }, gitDir: dir, now: NOW }).sha, A);
  assert.equal(buildInfo({ env: { GIT_SHA: "" }, gitDir: dir, now: NOW }).sha, A);
  assert.equal(buildInfo({ env: { GIT_SHA: "g".repeat(40) }, gitDir: dir, now: NOW }).sha, A);
});

test('nothing readable gives "unknown", so the build still succeeds', () => {
  assert.equal(buildInfo({ env: {}, gitDir: MISSING, now: NOW }).sha, "unknown");
});

test("run as a script it writes the file and exits 0, even with no .git at all", () => {
  const cwd = tempDir();
  const out = path.join(cwd, "build-info.json");
  execFileSync(process.execPath, [SCRIPT, out], {
    cwd,
    encoding: "utf8",
    timeout: 20000,
    env: { ...process.env, GIT_SHA: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const written = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(written.sha, "unknown");
  assert.match(written.builtAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test("run without an output path it refuses, rather than writing nowhere and exiting 0", () => {
  assert.throws(
    () =>
      execFileSync(process.execPath, [SCRIPT], {
        encoding: "utf8",
        timeout: 20000,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    (error) => error.status === 1,
  );
});
