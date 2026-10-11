import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CORS, getEnvValue, parseAccountIds, setEnvValue } from "./setup-r2.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "setup-r2.mjs");

test("fails (non-zero) when there is no .env, without waiting for input", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "setup-r2-"));
  const r = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8", input: "", timeout: 20000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No \.env/);
});

test("setEnvValue replaces an empty placeholder and appends a missing key", () => {
  let t = "A=1\nR2_BUCKET=\nB=2\n";
  t = setEnvValue(t, "R2_BUCKET", "family-memories");
  assert.equal(t, "A=1\nR2_BUCKET=family-memories\nB=2\n");
  t = setEnvValue(t, "R2_ACCOUNT_ID", "abc");
  assert.equal(getEnvValue(t, "R2_ACCOUNT_ID"), "abc");
  assert.equal(getEnvValue(t, "B"), "2");
});

test("getEnvValue treats an empty key as missing", () => {
  assert.equal(getEnvValue("R2_ACCESS_KEY_ID=\n", "R2_ACCESS_KEY_ID"), "");
  assert.equal(getEnvValue("X=1\n", "R2_ACCESS_KEY_ID"), "");
});

test("parseAccountIds dedupes and ignores non-ids", () => {
  const id = "0123456789abcdef0123456789abcdef";
  assert.deepEqual(parseAccountIds(`| Acc | ${id} |\n| ${id} |\nnot-an-id 1234`), [id]);
  assert.deepEqual(parseAccountIds("nothing here"), []);
});

test("CORS only allows PUT with Content-Type from prod and localhost", () => {
  const [rule] = CORS.rules;
  assert.deepEqual(rule.allowed.methods, ["PUT"]);
  assert.deepEqual(rule.allowed.headers, ["Content-Type"]);
  assert.deepEqual(rule.allowed.origins, ["https://memories.patrickrobel.dk", "http://localhost:3000"]);
});
