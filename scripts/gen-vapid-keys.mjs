#!/usr/bin/env node
// Generates the ONE VAPID keypair for Web Push and writes it straight into the
// local .env (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) without printing either value.
// Refuses to overwrite existing keys: rotating them kills every installed
// phone's push subscription. Push the result to prod with push-dokploy-env.
// Run from the repo root: node scripts/gen-vapid-keys.mjs
import { createECDH, generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(envPath)) fail("No .env here. Run scripts/setup-env.ps1 first (from the repo root).");

const lines = fs.readFileSync(envPath, { encoding: "utf8" }).split(/\r?\n/);
const valueOf = (key) => {
  const line = lines.find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1) : "";
};

for (const key of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]) {
  const v = valueOf(key);
  if (v) fail(`${key} is already set (length ${v.length}). Refusing: rotating VAPID keys kills every push subscription.`);
}

// P-256 keypair in the raw base64url form web-push expects:
// public = 0x04 || X || Y (65 bytes), private = D (32 bytes).
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const d = Buffer.from(jwk.d, "base64url");
const ecdh = createECDH("prime256v1");
ecdh.setPrivateKey(d);
const publicB64 = ecdh.getPublicKey().toString("base64url");
const privateB64 = d.toString("base64url");

function setKey(key, value) {
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else {
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    lines.push(`${key}=${value}`);
  }
}
setKey("VAPID_PUBLIC_KEY", publicB64);
setKey("VAPID_PRIVATE_KEY", privateB64);
if (lines[lines.length - 1] !== "") lines.push("");
fs.writeFileSync(envPath, lines.join("\n"), { encoding: "utf8" });

console.log("VAPID keypair written to .env (values not shown).");
console.log("Next: push to prod with scripts/push-dokploy-env.ps1, and back the keys up.");
