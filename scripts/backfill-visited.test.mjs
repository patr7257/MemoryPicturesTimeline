import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyRequested, formatPlan } from "./backfill-visited.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "backfill-visited.mjs");
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test("apply only for BACKFILL_VISITED_APPLY=1", () => {
  assert.equal(applyRequested({}), false);
  assert.equal(applyRequested({ BACKFILL_VISITED_APPLY: "1" }), true);
  assert.equal(applyRequested({ BACKFILL_VISITED_APPLY: "yes" }), false);
});

test("formats one line per person, countries sorted by name", () => {
  assert.deepEqual(
    formatPlan(
      [
        { personId: "p1", countryKey: "752", year: 2019 },
        { personId: "p1", countryKey: "208", year: 2018 },
      ],
      new Map([["p1", "Ann"]]),
      (k) => ({ 208: "Denmark", 752: "Sweden" })[k],
    ),
    ["Ann: Denmark (2018), Sweden (2019)"],
  );
});

test("refuses without DATABASE_URL, exits 1 and never waits for input", () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.BACKFILL_VISITED_APPLY;
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: tmp("backfill-"), env, encoding: "utf8", input: "", timeout: 20000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /DATABASE_URL is not set/);
});

// A fake pool answers by SQL text, so syncTrips runs end to end with no database.
const FAKE = `
import { syncTrips } from ${JSON.stringify(new URL("./backfill-visited.mjs", import.meta.url).href)};
const calls = [];
const pool = {
  async query(sql) {
    calls.push(sql.split(" ").slice(0, 3).join(" "));
    if (sql.includes("FROM trips")) return { rows: [
      // t1: no photos, own place in Stockholm (Sweden, 752). t2: photo in Copenhagen (208), no place.
      { id: "t1", start_date: "2019-05-01", lat: 59.33, lng: 18.06 },
      { id: "t2", start_date: "2018-06-01", lat: null, lng: null },
    ] };
    if (sql.includes("FROM trip_people")) return { rows: [{ trip_id: "t1", person_id: "p1" }, { trip_id: "t2", person_id: "p1" }, { trip_id: "t2", person_id: "p2" }] };
    if (sql.includes("FROM photos")) return { rows: [{ trip_id: "t2", lat: 55.67, lng: 12.56 }] };
    if (sql.includes("FROM person_countries")) return { rows: [{ person_id: "p2", country_key: "208" }] };
    throw new Error("unexpected " + sql);
  },
  async connect() { throw new Error("must not write on a dry run"); },
};
const out = await syncTrips(pool, null, { apply: false });
console.log(JSON.stringify(out));
`;

test("syncTrips under tsx: a vacation with no photos and a place yields its country, existing rows are skipped, dry run writes nothing", () => {
  const r = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", FAKE], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: "",
    timeout: 60000,
  });
  assert.equal(r.status, 0, r.stderr);
  const { rows, tripsChecked } = JSON.parse(r.stdout.trim().split("\n").pop());
  assert.equal(tripsChecked, 2);
  assert.deepEqual(rows, [
    { personId: "p1", countryKey: "208", year: 2018 },
    { personId: "p1", countryKey: "752", year: 2019 },
  ]);
});

test("without tsx the TypeScript lookup fails to load (callers catch this)", () => {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", FAKE], { cwd: process.cwd(), encoding: "utf8", input: "", timeout: 60000 });
  assert.notEqual(r.status, 0);
});
