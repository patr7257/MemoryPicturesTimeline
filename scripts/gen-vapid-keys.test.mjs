import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "gen-vapid-keys.mjs");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vapid-"));
const run = (cwd) => spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8", input: "" });
const readEnv = (dir) => fs.readFileSync(path.join(dir, ".env"), { encoding: "utf8" });

test("fails (non-zero) when there is no .env", () => {
  const r = run(tmp());
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /No \.env/);
});

test("writes a valid matching keypair and never prints it", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, ".env"), "A=1\nVAPID_PUBLIC_KEY=\nVAPID_PRIVATE_KEY=\nB=2\n");
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  const env = readEnv(dir);
  const pub = /^VAPID_PUBLIC_KEY=(.+)$/m.exec(env)[1];
  const priv = /^VAPID_PRIVATE_KEY=(.+)$/m.exec(env)[1];
  assert.equal(Buffer.from(pub, "base64url").length, 65);
  assert.equal(Buffer.from(pub, "base64url")[0], 4);
  assert.equal(Buffer.from(priv, "base64url").length, 32);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(priv, "base64url"));
  assert.equal(ecdh.getPublicKey().toString("base64url"), pub);
  assert.ok(!r.stdout.includes(pub) && !r.stdout.includes(priv));
  assert.ok(!r.stderr.includes(priv));
  assert.match(env, /^A=1$/m);
  assert.match(env, /^B=2$/m);
});

test("appends the keys when the .env has no placeholder lines", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, ".env"), "A=1\n");
  assert.equal(run(dir).status, 0);
  assert.match(readEnv(dir), /^VAPID_PRIVATE_KEY=.+$/m);
});

test("refuses to overwrite existing keys and leaves the file untouched", () => {
  const dir = tmp();
  const before = "VAPID_PUBLIC_KEY=keep\nVAPID_PRIVATE_KEY=\n";
  fs.writeFileSync(path.join(dir, ".env"), before);
  const r = run(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /already set/);
  assert.equal(readEnv(dir), before);
});
