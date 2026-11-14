#!/usr/bin/env node
// Fills missing photo locations from photos taken the same day in the same
// vacation (rule: src/lib/infer-location.mjs, the same one uploads use), and
// flags them location_inferred. Prints every match first and writes only
// after a yes. FILL_LOCATIONS_UNDO=1 clears every inferred location instead.
// Run from the repo root: node scripts/fill-locations.mjs
//   FILL_LOCATIONS_YES=1   write without asking (no terminal, or CI)
//   FILL_LOCATIONS_UNDO=1  remove inferred locations instead of adding them
// Needs DATABASE_URL in .env and the location_inferred column (pnpm db:migrate).
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";

import { inferLocations } from "../src/lib/infer-location.mjs";

// taken_at is the camera's wall clock stored without a zone. Read it as text
// and keep the wall clock as UTC parts, the app's rule (never the runner's zone).
export function parseWallClock(text) {
  if (!text) return null;
  const d = new Date(`${String(text).replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toInferRows(rows) {
  return rows.map((r) => ({
    id: r.id,
    tripId: r.trip_id,
    takenAt: parseWallClock(r.taken_at),
    lat: r.lat === null ? null : Number(r.lat),
    lng: r.lng === null ? null : Number(r.lng),
    city: r.city,
    country: r.country,
    locationInferred: r.location_inferred === true,
  }));
}

export function planLine(fill, byId, titles) {
  const p = byId.get(fill.id);
  const when = p?.takenAt ? p.takenAt.toISOString().slice(0, 16).replace("T", " ") : "?";
  const place = [fill.city, fill.country].filter(Boolean).join(", ") || `${fill.lat.toFixed(4)}, ${fill.lng.toFixed(4)}`;
  return `${titles.get(p?.tripId) ?? "?"} | ${when} | ${place} | ${fill.minutesApart} min apart`;
}

async function confirm(question) {
  if (process.env.FILL_LOCATIONS_YES === "1") return true;
  if (!process.stdin.isTTY) return null;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

function fail(message) {
  console.error(`FAILED: ${message}`);
  process.exit(1);
}

async function main() {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set (run from the repo root with a .env).");
  const undo = process.env.FILL_LOCATIONS_UNDO === "1";

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  try {
    let rows;
    try {
      ({ rows } = await pool.query(
        `SELECT p.id, p.trip_id, p.taken_at::text AS taken_at, p.lat, p.lng, p.city, p.country,
                p.location_inferred, t.title
           FROM photos p JOIN trips t ON t.id = p.trip_id`,
      ));
    } catch (err) {
      if (/location_inferred/.test(String(err?.message))) fail("column location_inferred is missing: run pnpm db:migrate first.");
      throw err;
    }
    if (rows.length === 0) fail("checked 0 photos; is DATABASE_URL the right database?");
    const titles = new Map(rows.map((r) => [r.trip_id, r.title]));
    const photos = toInferRows(rows);
    const missing = photos.filter((p) => p.lat === null || p.lng === null).length;

    if (undo) {
      const inferred = photos.filter((p) => p.locationInferred);
      console.log(`Checked ${photos.length} photos: ${inferred.length} have an inferred location.`);
      if (inferred.length === 0) return;
      const ok = await confirm(`Remove ${inferred.length} inferred locations?`);
      if (ok === null) return console.log("Dry run only. Set FILL_LOCATIONS_YES=1 to write.");
      if (!ok) fail("nothing removed, you said no.");
      const res = await pool.query(
        `UPDATE photos SET lat = NULL, lng = NULL, city = NULL, country = NULL, location_inferred = false
          WHERE location_inferred`,
      );
      console.log(`Removed ${res.rowCount} inferred locations.`);
      return;
    }

    const plan = inferLocations(photos);
    const byId = new Map(photos.map((p) => [p.id, p]));
    console.log(`Checked ${photos.length} photos: ${missing} without a location, ${plan.length} can be filled from the same day.`);
    console.log("vacation | taken | copied place | gap");
    for (const fill of plan) console.log(`  ${planLine(fill, byId, titles)}`);
    if (plan.length === 0) return;

    const ok = await confirm(`Write ${plan.length} locations to the database?`);
    if (ok === null) return console.log("Dry run only. Set FILL_LOCATIONS_YES=1 to write.");
    if (!ok) fail("nothing written, you said no.");

    const client = await pool.connect();
    let written = 0;
    try {
      await client.query("BEGIN");
      for (const f of plan) {
        const res = await client.query(
          `UPDATE photos SET lat = $2, lng = $3, city = $4, country = $5, location_inferred = true
            WHERE id = $1 AND lat IS NULL`,
          [f.id, f.lat, f.lng, f.city, f.country],
        );
        written += res.rowCount;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    console.log(`Wrote ${written} locations (flagged as inferred). Undo: FILL_LOCATIONS_UNDO=1.`);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
}
