import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseWallClock, planLine, toInferRows } from "./fill-locations.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "fill-locations.mjs");
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test("refuses without DATABASE_URL, exits 1 and never waits for input", () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.FILL_LOCATIONS_YES;
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: tmp("fill-"), env, encoding: "utf8", input: "", timeout: 20000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /DATABASE_URL is not set/);
});

test("reads the stored wall clock as UTC parts, whatever the runner's zone", () => {
  assert.equal(parseWallClock("2025-11-22 23:30:00")?.toISOString(), "2025-11-22T23:30:00.000Z");
  assert.equal(parseWallClock("2025-11-22 08:05:00.123")?.toISOString(), "2025-11-22T08:05:00.123Z");
  assert.equal(parseWallClock(null), null);
  assert.equal(parseWallClock("not a date"), null);
});

test("maps database rows to the inference shape", () => {
  const [row] = toInferRows([
    { id: "a", trip_id: "t", taken_at: "2025-11-22 10:00:00", lat: "38.7", lng: null, city: null, country: null, location_inferred: false },
  ]);
  assert.deepEqual(row, {
    id: "a",
    tripId: "t",
    takenAt: new Date("2025-11-22T10:00:00Z"),
    lat: 38.7,
    lng: null,
    city: null,
    country: null,
    locationInferred: false,
  });
});

test("describes a planned fill on one line", () => {
  const byId = new Map([["x", { tripId: "t", takenAt: new Date("2025-11-22T15:10:00Z") }]]);
  const titles = new Map([["t", "Lissabon"]]);
  const fill = { id: "x", fromId: "b", lat: 38.69, lng: -9.21, city: "Belém", country: "Portugal", minutesApart: 50 };
  assert.equal(planLine(fill, byId, titles), "Lissabon | 2025-11-22 15:10 | Belém, Portugal | 50 min apart");
  assert.equal(planLine({ ...fill, city: null, country: null }, byId, titles), "Lissabon | 2025-11-22 15:10 | 38.6900, -9.2100 | 50 min apart");
});
