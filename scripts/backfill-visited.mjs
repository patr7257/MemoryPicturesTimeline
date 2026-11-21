#!/usr/bin/env node
// Marks the countries found in each vacation's GPS photos (and the vacation's
// own place) as Visited for the people tagged on it. Rows in any status
// (visited, wishlist, dismissed) are never changed or re-added; new rows carry
// the year of the earliest vacation. Dry run by default: prints the plan only.
// Run from the repo root: pnpm backfill:visited   (node --import tsx scripts/backfill-visited.mjs)
//   BACKFILL_VISITED_APPLY=1  write the rows (asks first when a terminal is attached)
// Needs DATABASE_URL in .env. The point lookup is TypeScript, so it runs under tsx.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";

export function applyRequested(env) {
  return env.BACKFILL_VISITED_APPLY === "1";
}

// One line per person, countries sorted by name, each with its year.
export function formatPlan(rows, personNames, countryName) {
  const byPerson = new Map();
  for (const r of rows) {
    if (!byPerson.has(r.personId)) byPerson.set(r.personId, []);
    byPerson.get(r.personId).push(r);
  }
  const lines = [...byPerson.entries()].map(([personId, list]) => {
    const countries = list
      .map((r) => ({ name: countryName(r.countryKey) ?? r.countryKey, year: r.year }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `${c.name} (${c.year})`);
    return { name: personNames.get(personId) ?? personId, text: countries.join(", ") };
  });
  lines.sort((a, b) => a.name.localeCompare(b.name));
  return lines.map((l) => `${l.name}: ${l.text}`);
}

// Same shapes as src/lib/country-lookup.ts, which is server-only and so cannot be imported here.
async function buildShapes() {
  const { toCountryShapes } = await import("../src/lib/point-in-country.ts");
  const { feature } = await import("topojson-client");
  const atlas = createRequire(import.meta.url)("world-atlas/countries-50m.json");
  const collection = feature(atlas, atlas.objects.countries);
  return toCountryShapes(collection.features);
}

// tripIds null: every vacation, read in start_date order. Returns the rows planned
// (and written when apply is true). Throws when the TypeScript modules cannot load.
export async function syncTrips(pool, tripIds, opts) {
  const { planVisitedRows, distinctPoints, rowKey, vacationPoints } = await import("../src/lib/auto-visited.ts");
  const { resolveKey } = await import("../src/lib/point-in-country.ts");
  const shapes = await buildShapes();

  const tripsRes = tripIds
    ? await pool.query("SELECT id, start_date::text AS start_date, lat, lng FROM trips WHERE id = ANY($1) ORDER BY start_date", [tripIds])
    : await pool.query("SELECT id, start_date::text AS start_date, lat, lng FROM trips ORDER BY start_date");
  const ids = tripsRes.rows.map((t) => t.id);
  if (ids.length === 0) return { rows: [], tripsChecked: 0 };

  const peopleRes = await pool.query("SELECT trip_id, person_id FROM trip_people WHERE trip_id = ANY($1)", [ids]);
  const photoRes = await pool.query(
    "SELECT trip_id, lat, lng FROM photos WHERE trip_id = ANY($1) AND lat IS NOT NULL AND lng IS NOT NULL",
    [ids],
  );
  const people = new Map();
  for (const r of peopleRes.rows) {
    if (!people.has(r.trip_id)) people.set(r.trip_id, []);
    people.get(r.trip_id).push(r.person_id);
  }
  const points = new Map();
  for (const r of photoRes.rows) {
    if (!points.has(r.trip_id)) points.set(r.trip_id, []);
    points.get(r.trip_id).push({ lat: Number(r.lat), lng: Number(r.lng) });
  }
  const allPeople = [...new Set(peopleRes.rows.map((r) => r.person_id))];
  const existingRes = allPeople.length
    ? await pool.query("SELECT person_id, country_key FROM person_countries WHERE person_id = ANY($1)", [allPeople])
    : { rows: [] };
  const existing = new Set(existingRes.rows.map((r) => rowKey(r.person_id, r.country_key)));

  const vacations = tripsRes.rows.map((t) => {
    // Photos locate a vacation; its own place only when it has no located photo.
    const place = t.lat !== null && t.lng !== null ? { lat: Number(t.lat), lng: Number(t.lng) } : null;
    const pts = vacationPoints(points.get(t.id) ?? [], place);
    const keys = new Set();
    for (const p of distinctPoints(pts)) {
      const key = resolveKey(shapes, p.lat, p.lng);
      if (key !== null) keys.add(key);
    }
    return { tripId: t.id, startDate: t.start_date, personIds: people.get(t.id) ?? [], countryKeys: [...keys] };
  });

  const rows = planVisitedRows(vacations, existing);
  if (opts.apply && rows.length > 0) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const r of rows) {
        await client.query(
          `INSERT INTO person_countries (person_id, country_key, status, year, updated_by)
           VALUES ($1, $2, 'visited', $3, NULL) ON CONFLICT DO NOTHING`,
          [r.personId, r.countryKey, r.year],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  return { rows, tripsChecked: tripsRes.rows.length };
}

async function confirm(question) {
  if (!process.stdin.isTTY) return true;
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
  const apply = applyRequested(process.env);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 60000 });
  try {
    // Plan first, always as a dry run; the write is a second pass only after a yes.
    const { rows, tripsChecked } = await syncTrips(pool, null, { apply: false });
    if (tripsChecked === 0) fail("checked 0 vacations; is DATABASE_URL the right database?");
    const { COUNTRIES } = await import("../src/lib/country-catalog.ts");
    const names = new Map((await pool.query("SELECT id, name FROM people")).rows.map((p) => [p.id, p.name]));
    const countryNames = new Map(COUNTRIES.map((c) => [c.key, c.name]));
    console.log(`Checked ${tripsChecked} vacations: ${rows.length} visited marks would be added.`);
    for (const line of formatPlan(rows, names, (k) => countryNames.get(k))) console.log(`  ${line}`);
    if (rows.length === 0) return;
    if (!apply) return console.log("Dry run only. Set BACKFILL_VISITED_APPLY=1 to write.");
    if (!(await confirm(`Write ${rows.length} visited marks to the database?`))) fail("nothing written, you said no.");
    const written = await syncTrips(pool, null, { apply: true });
    console.log(`Wrote ${written.rows.length} visited marks.`);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
}
