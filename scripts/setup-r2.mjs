#!/usr/bin/env node
// Creates the private R2 photo bucket, sets its browser-upload CORS rule, and
// fills the R2_* keys in the local .env (secrets are typed at a prompt, never
// printed). Safe to re-run: an existing bucket or already-set key is kept.
// Needs a prior `npx wrangler login`.
// Run from the repo root: node scripts/setup-r2.mjs
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

export const BUCKET = "family-memories";
export const WRANGLER = "npx --yes wrangler@4.139.0";
export const CORS = {
  rules: [
    {
      allowed: {
        origins: ["https://memories.patrickrobel.dk", "http://localhost:3000"],
        methods: ["PUT"],
        headers: ["Content-Type"],
      },
      maxAgeSeconds: 3600,
    },
  ],
};

export function getEnvValue(text, key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim() : "";
}

export function setEnvValue(text, key, value) {
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, `${key}=${value}`);
  return `${text.replace(/\n*$/, "\n")}${key}=${value}\n`;
}

// wrangler whoami prints a table with one 32-hex account id per account.
export function parseAccountIds(whoamiOutput) {
  return [...new Set(whoamiOutput.match(/\b[0-9a-f]{32}\b/g) ?? [])];
}

function wrangler(args) {
  return execSync(`${WRANGLER} ${args}`, { encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
}

async function main() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    console.error("No .env here. Run from the repo root after scripts/setup-env.ps1.");
    process.exit(1);
  }
  let env = fs.readFileSync(envPath, { encoding: "utf8" });

  let accountId = getEnvValue(env, "R2_ACCOUNT_ID");
  if (!accountId) {
    let out;
    try {
      out = wrangler("whoami");
    } catch {
      console.error("wrangler is not logged in. Run: npx --yes wrangler@4.139.0 login");
      process.exit(1);
    }
    const ids = parseAccountIds(out);
    if (ids.length !== 1) {
      console.error(`Found ${ids.length} Cloudflare accounts; set R2_ACCOUNT_ID in .env and re-run.`);
      process.exit(1);
    }
    accountId = ids[0];
  }

  try {
    wrangler(`r2 bucket create ${BUCKET} --location weur`);
    console.log(`Bucket ${BUCKET} created (private).`);
  } catch (e) {
    const msg = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    if (!/already exists|10004/i.test(msg)) {
      console.error(`Bucket create failed:\n${msg}`);
      process.exit(1);
    }
    console.log(`Bucket ${BUCKET} already exists, kept.`);
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "r2cors-"));
  const corsFile = path.join(dir, "cors.json");
  fs.writeFileSync(corsFile, JSON.stringify(CORS), { encoding: "utf8" });
  try {
    wrangler(`r2 bucket cors set ${BUCKET} --file "${corsFile}" --force`);
    console.log("CORS set: PUT from memories.patrickrobel.dk and localhost:3000.");
  } catch (e) {
    console.error(`CORS set failed:\n${e.stdout ?? ""}${e.stderr ?? ""}`);
    process.exit(1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  env = setEnvValue(env, "R2_ACCOUNT_ID", accountId);
  env = setEnvValue(env, "R2_BUCKET", BUCKET);

  const missing = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter((k) => !getEnvValue(env, k));
  if (missing.length) {
    if (!process.stdin.isTTY) {
      fs.writeFileSync(envPath, env, { encoding: "utf8" });
      console.error(`Still empty: ${missing.join(", ")}. Re-run in a terminal to paste them.`);
      process.exit(1);
    }
    console.log(
      `\nCreate an R2 API token: https://dash.cloudflare.com/${accountId}/r2/api-tokens\n` +
        `  Create API token > Object Read & Write > Apply to specific buckets only: ${BUCKET} > Create.\n` +
        "  Then paste the two S3 values shown on the result page.\n",
    );
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    for (const key of missing) {
      const label = key === "R2_ACCESS_KEY_ID" ? "Access Key ID" : "Secret Access Key";
      const v = (await rl.question(`${label}: `)).trim();
      if (!v) {
        rl.close();
        fs.writeFileSync(envPath, env, { encoding: "utf8" });
        console.error(`${key} left empty. Re-run to finish.`);
        process.exit(1);
      }
      env = setEnvValue(env, key, v);
    }
    rl.close();
  }

  fs.writeFileSync(envPath, env, { encoding: "utf8" });
  console.log("R2 keys written to .env (values not shown). Done.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
