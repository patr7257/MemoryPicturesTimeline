# Where Have I Been Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/countries` page where every Person has a map of visited countries with stats, a private wishlist, year and note per country, suggestions from their vacations, a family map, a two-person compare and a shareable image.

**Architecture:** One new table (`person_countries`) keyed by person and country key. Pure rules and maths live in small tested modules (`access-policy.ts`, `countries.ts`, `country-catalog.ts`, `point-in-country.ts`); queries and server actions are thin wrappers over them. The page works from a searchable list alone; a lazily loaded MapLibre map with a code-built style (country shapes only) sits on top of the same state.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + Postgres (Neon), vitest, `maplibre-gl` 5 + `react-map-gl` 8, `topojson-client`, `world-atlas` (all installed). New: `world-countries` as a devDependency for the catalog generator only.

**Spec:** `docs/superpowers/specs/2026-11-19-where-have-i-been-design.md`

## Global Constraints

- Every page, action and query starts from `getViewer()` (`src/lib/access.ts`) and decides through pure functions in `src/lib/access-policy.ts`.
- Country keys are strings with leading zeros (`"036"`, `"010"`). Never `Number()` a key, never compare keys numerically.
- UN member denominator is 193 and is read from the catalog (`UN_MEMBER_TOTAL`), never typed into UI or logic.
- `maplibre-gl`, `world-atlas/countries-50m.json` and `topojson-client` load only through `next/dynamic` with `ssr: false` or `import()`. Never in a first-load bundle.
- No `Math.random()` and no `Date.now()` in render paths.
- No paywall code. Globe switch, family and compare views, wishlist, year and note stay separate components or props.
- UI copy says "Countries", "Visited", "Want to go". Single warm light theme, no dark mode.
- No em dashes or en dashes anywhere (code, comments, copy, commits). No AI attribution in commits.
- Text files UTF-8 without BOM, `\n` newlines.
- The database is shared by local dev and production. Migrations are additive only. `pnpm db:migrate` runs only after Patrick says go (Task 4).
- After adding the route run `pnpm build` once so typedRoutes regenerates. Never commit `next-env.d.ts` changes.
- Work stays on branch `feat/countries`. Never push to `main`.

## Review Focus

1. **Key with the wrong shape from the client** (`"36"` for `"036"`, a number, an unknown key): the action rejects it and writes nothing. Pinned in Task 1 (`isCountryKey`) and Task 6.
2. **`?person=` naming a deleted or unknown person, or the same person twice**: the page falls back to a valid selection and never 500s. Pinned in Task 2 (`resolveSelection`).
3. **Year input** (`""`, `"abc"`, `1899`, next year, `2019.5`): empty clears the year, the rest are refused, nothing is written. Pinned in Task 2 (`parseYear`).
4. **A photo at sea, at `0,0`, or with out-of-range coordinates**: the lookup returns `null`, that photo gives no suggestion, nothing throws. Pinned in Task 5.
5. **A person with no marks at all**: stats show zeros and `0%`, never `NaN`, and the list still renders every country. Pinned in Task 2 (`countryStats([])`).

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/gen-country-catalog.mjs` | Builds the catalog from the shapes file plus `world-countries` |
| `scripts/gen-country-catalog.test.mjs` | `node --test` twin for the generator's pure parts |
| `src/lib/country-catalog.json` | Generated, committed: every markable country and territory |
| `src/lib/country-catalog.ts` | Typed access to the catalog, key validation, shape-to-key mapping |
| `src/lib/countries.ts` | Pure: stats, selection, compare, fills, year and note parsing |
| `src/lib/access-policy.ts` | Adds the countries rules (modify) |
| `src/db/schema.ts` | Adds `personCountries` (modify) |
| `src/lib/point-in-country.ts` | Pure point-in-polygon over country shapes |
| `src/lib/country-lookup.ts` | Server-only: loads the shapes once, `countryKeyAt` |
| `src/lib/country-queries.ts` | Server-only reads: marks per tier, visited per person, suggestions |
| `src/actions/countries.ts` | Server actions: status, year, note, remove |
| `src/lib/nav.ts`, `src/components/site/AppNav.tsx` | Nav entry (modify) |
| `src/app/(app)/countries/page.tsx` | The page |
| `src/components/countries/*` | Picker, view, stats, list, card, suggestions, map, share button |
| `src/lib/share-map-image.ts` | Composes the PNG in the browser |

---

### Task 1: Country catalog

**Files:**
- Create: `scripts/gen-country-catalog.mjs`, `scripts/gen-country-catalog.test.mjs`, `src/lib/country-catalog.json`, `src/lib/country-catalog.ts`
- Test: `src/lib/country-catalog.test.ts`
- Modify: `package.json` (devDependency `world-countries`)

**Interfaces:**
- Produces:

```ts
// src/lib/country-catalog.ts
export type Continent =
  | "Europe" | "Asia" | "Africa" | "North America" | "South America" | "Oceania" | "Antarctica";
export const CONTINENTS: readonly Continent[]; // in the order above
export type Country = {
  key: string; name: string; flag: string;
  continent: Continent; unMember: boolean; hasShape: boolean;
};
export const COUNTRIES: readonly Country[]; // sorted by name
export const UN_MEMBER_TOTAL: number;       // counted from COUNTRIES
export function countryByKey(key: string): Country | undefined;
export function isCountryKey(key: unknown): key is string;
// Catalog key for a raw world-atlas feature, or null when it is not markable.
export function shapeKey(f: { id?: string | number; properties: { name: string } }): string | null;
```

- [ ] **Step 1: Install the dataset.** Run `pnpm add -D world-countries` in the repo root. Then confirm the fields the generator needs exist: `node -e "const c=require('world-countries');const d=c.find(x=>x.cca2==='DK');console.log(d.ccn3,d.region,d.subregion,d.unMember,d.flag,d.name.common)"`. Expected: `208 Europe Northern Europe true` followed by the flag and `Denmark`. If any field is missing, stop and report: the catalog source must be rechosen.

- [ ] **Step 2: Write the failing generator test** in `scripts/gen-country-catalog.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { continentOf, buildCatalog } from "./gen-country-catalog.mjs";

test("continentOf splits the Americas and maps Antarctic", () => {
  assert.equal(continentOf({ region: "Americas", subregion: "South America" }), "South America");
  assert.equal(continentOf({ region: "Americas", subregion: "Caribbean" }), "North America");
  assert.equal(continentOf({ region: "Antarctic", subregion: "" }), "Antarctica");
  assert.equal(continentOf({ region: "Europe", subregion: "Northern Europe" }), "Europe");
});

test("buildCatalog: shapes get entries, UN members without a shape are list-only", () => {
  const shapes = [
    { id: "208", properties: { name: "Denmark" } },
    { id: "036", properties: { name: "Australia" } },
    { id: "036", properties: { name: "Ashmore and Cartier Is." } },
    { properties: { name: "Kosovo" } },
    { properties: { name: "Siachen Glacier" } },
  ];
  const dataset = [
    { ccn3: "208", name: { common: "Denmark" }, flag: "DK", region: "Europe", subregion: "Northern Europe", unMember: true },
    { ccn3: "036", name: { common: "Australia" }, flag: "AU", region: "Oceania", subregion: "", unMember: true },
    { ccn3: "798", name: { common: "Tuvalu" }, flag: "TV", region: "Oceania", subregion: "Polynesia", unMember: true },
  ];
  const cat = buildCatalog(shapes, dataset);
  assert.deepEqual(cat.map((c) => c.key).sort(), ["036", "208", "798", "kosovo"]);
  assert.equal(cat.find((c) => c.key === "798").hasShape, false);
  assert.equal(cat.find((c) => c.key === "036").name, "Australia");
  assert.equal(cat.find((c) => c.key === "kosovo").unMember, false);
});
```

- [ ] **Step 3: Run it.** `node --test scripts/gen-country-catalog.test.mjs`. Expected: FAIL, module not found.

- [ ] **Step 4: Implement `scripts/gen-country-catalog.mjs`** exporting `continentOf(entry)` and `buildCatalog(shapes, dataset)`, with a `main` guarded by `import.meta.url` that reads `node_modules/world-atlas/countries-50m.json` (resolved from `process.cwd()`), calls `buildCatalog`, and writes `src/lib/country-catalog.json` sorted by `name`, 2-space JSON, trailing `\n`. Rules `buildCatalog` must follow:
  - A shape with an id that matches a dataset `ccn3` becomes an entry with that id as key, the dataset's `name.common`, `flag`, continent and `unMember`. A second shape with an id already used adds nothing.
  - Shapes without an id: `Kosovo` gets key `kosovo` (Europe), `N. Cyprus` gets `n-cyprus` (Europe), `Somaliland` gets `somaliland` (Africa), all `unMember: false`, flag empty string except Kosovo's from the dataset when present. Any other shape without an id adds nothing.
  - A shape whose id has no dataset match adds nothing.
  - Every dataset entry with `unMember: true` and no entry yet is added with `hasShape: false`.
  - Antarctica (`010`) is kept, continent `Antarctica`.

- [ ] **Step 5: Run the test, then generate.** `node --test scripts/gen-country-catalog.test.mjs` expected PASS. Then `node scripts/gen-country-catalog.mjs` and confirm `src/lib/country-catalog.json` exists.

- [ ] **Step 6: Write the failing catalog test** in `src/lib/country-catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import atlas from "world-atlas/countries-50m.json";
import { COUNTRIES, UN_MEMBER_TOTAL, countryByKey, isCountryKey, shapeKey } from "./country-catalog";

const shapes = (atlas as unknown as {
  objects: { countries: { geometries: { id?: string; properties: { name: string } }[] } };
}).objects.countries.geometries;

describe("country catalog", () => {
  it("has exactly 193 UN members", () => {
    expect(UN_MEMBER_TOTAL).toBe(193);
  });
  it("has unique keys", () => {
    expect(new Set(COUNTRIES.map((c) => c.key)).size).toBe(COUNTRIES.length);
  });
  it("every entry with a shape is reachable from a shape", () => {
    const reachable = new Set(shapes.map(shapeKey).filter(Boolean));
    for (const c of COUNTRIES) if (c.hasShape) expect(reachable.has(c.key), c.name).toBe(true);
  });
  it("keeps territories apart and Tuvalu list-only", () => {
    expect(countryByKey("208")?.name).toBe("Denmark");
    expect(countryByKey("304")?.name).toBe("Greenland");
    expect(countryByKey("234")?.unMember).toBe(false);
    expect(countryByKey("798")).toMatchObject({ unMember: true, hasShape: false });
  });
  it("maps shapes to keys", () => {
    expect(shapeKey({ id: "036", properties: { name: "Ashmore and Cartier Is." } })).toBe("036");
    expect(shapeKey({ properties: { name: "Kosovo" } })).toBe("kosovo");
    expect(shapeKey({ properties: { name: "Siachen Glacier" } })).toBeNull();
    expect(shapeKey({ id: 36, properties: { name: "Australia" } })).toBeNull();
  });
  it("validates keys strictly", () => {
    expect(isCountryKey("036")).toBe(true);
    expect(isCountryKey("36")).toBe(false);
    expect(isCountryKey(36)).toBe(false);
    expect(isCountryKey("nowhere")).toBe(false);
    expect(isCountryKey(undefined)).toBe(false);
  });
});
```

- [ ] **Step 7: Run it.** `pnpm vitest run src/lib/country-catalog.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 8: Implement `src/lib/country-catalog.ts`** with the signatures above. It imports the JSON, builds one `Map` by key, and `shapeKey` returns the string id when it is a catalog key, the three slug keys by name, otherwise `null` (a numeric id is not a string and returns `null`).

- [ ] **Step 9: Run both suites.** `pnpm vitest run src/lib/country-catalog.test.ts` and `node --test scripts/gen-country-catalog.test.mjs`. Expected: PASS. If the UN count is not 193, stop and report which members are missing or extra: do not adjust the test.

- [ ] **Step 10: Commit.**

```bash
git add package.json pnpm-lock.yaml scripts/gen-country-catalog.mjs scripts/gen-country-catalog.test.mjs src/lib/country-catalog.json src/lib/country-catalog.ts src/lib/country-catalog.test.ts
git commit -m "feat: country catalog generated from the map shapes"
```

---

### Task 2: Pure country maths

**Files:**
- Create: `src/lib/countries.ts`
- Test: `src/lib/countries.test.ts`

**Interfaces:**
- Consumes: `COUNTRIES`, `CONTINENTS`, `UN_MEMBER_TOTAL`, `countryByKey`, `Continent` from Task 1.
- Produces:

```ts
export type CountryStatus = "visited" | "wishlist" | "dismissed";
export type CountryMark = { countryKey: string; status: CountryStatus; year: number | null; note?: string | null };

export type CountryStats = {
  total: number;      // visited countries and territories
  unMembers: number;  // visited UN members
  unTotal: number;    // UN_MEMBER_TOTAL
  percent: number;    // Math.round(unMembers / unTotal * 100)
  continents: { continent: Continent; visited: number; total: number }[]; // CONTINENTS order
};
export function countryStats(visitedKeys: readonly string[]): CountryStats;

export type Selection =
  | { mode: "single"; personId: string }
  | { mode: "compare"; a: string; b: string }
  | { mode: "union"; personIds: string[] };
export function resolveSelection(input: {
  personIds: readonly string[]; family: boolean;
  viewerPersonId: string | null; allPersonIds: readonly string[];
}): Selection;

export function comparePartition(a: readonly string[], b: readonly string[]):
  { onlyA: string[]; onlyB: string[]; both: string[] };

export type FillState = "visited" | "wishlist" | "onlyA" | "onlyB" | "both";
export function fillsForMarks(marks: readonly CountryMark[]): Record<string, FillState>;
export function fillsForCompare(a: readonly string[], b: readonly string[]): Record<string, FillState>;
export function fillsForUnion(keys: readonly string[]): Record<string, FillState>;

export const YEAR_MIN = 1900;
export const NOTE_MAX = 500;
export function parseYear(raw: unknown, currentYear: number): { ok: true; year: number | null } | { ok: false };
export function cleanNote(raw: unknown): { ok: true; note: string | null } | { ok: false };
```

- [ ] **Step 1: Write the failing tests** in `src/lib/countries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COUNTRIES, UN_MEMBER_TOTAL } from "./country-catalog";
import {
  cleanNote, comparePartition, countryStats, fillsForCompare, fillsForMarks,
  fillsForUnion, NOTE_MAX, parseYear, resolveSelection,
} from "./countries";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("countryStats", () => {
  it("is all zeros for nobody", () => {
    const s = countryStats([]);
    expect(s).toMatchObject({ total: 0, unMembers: 0, unTotal: UN_MEMBER_TOTAL, percent: 0 });
    expect(s.continents.reduce((n, c) => n + c.total, 0)).toBe(COUNTRIES.length);
    expect(s.continents.every((c) => c.visited === 0)).toBe(true);
  });
  it("counts territories in total but not as UN members", () => {
    const s = countryStats(["208", "304", "234"]); // Denmark, Greenland, Faroe Islands
    expect(s.total).toBe(3);
    expect(s.unMembers).toBe(1);
    expect(s.percent).toBe(1);
  });
  it("ignores duplicates and unknown keys", () => {
    expect(countryStats(["208", "208", "nowhere"]).total).toBe(1);
  });
});

describe("resolveSelection", () => {
  const all = [A, B, C];
  it("defaults to the viewer's own person", () => {
    expect(resolveSelection({ personIds: [], family: false, viewerPersonId: A, allPersonIds: all }))
      .toEqual({ mode: "single", personId: A });
  });
  it("falls back to the family when the viewer has no person", () => {
    expect(resolveSelection({ personIds: [], family: false, viewerPersonId: null, allPersonIds: all }))
      .toEqual({ mode: "union", personIds: all });
  });
  it("family wins over a person list", () => {
    expect(resolveSelection({ personIds: [A], family: true, viewerPersonId: A, allPersonIds: all }))
      .toEqual({ mode: "union", personIds: all });
  });
  it("two people compare, three union", () => {
    expect(resolveSelection({ personIds: [B, A], family: false, viewerPersonId: A, allPersonIds: all }))
      .toEqual({ mode: "compare", a: B, b: A });
    expect(resolveSelection({ personIds: [A, B, C], family: false, viewerPersonId: A, allPersonIds: all }))
      .toEqual({ mode: "union", personIds: [A, B, C] });
  });
  it("drops unknown people, then applies the rules to what is left", () => {
    const gone = "44444444-4444-4444-8444-444444444444";
    expect(resolveSelection({ personIds: [gone, B], family: false, viewerPersonId: A, allPersonIds: all }))
      .toEqual({ mode: "single", personId: B });
    expect(resolveSelection({ personIds: [gone], family: false, viewerPersonId: A, allPersonIds: all }))
      .toEqual({ mode: "single", personId: A });
  });
});

describe("compare and fills", () => {
  it("partitions", () => {
    expect(comparePartition(["208", "578"], ["578", "752"]))
      .toEqual({ onlyA: ["208"], onlyB: ["752"], both: ["578"] });
  });
  it("fills for one person skip dismissed", () => {
    expect(fillsForMarks([
      { countryKey: "208", status: "visited", year: null },
      { countryKey: "392", status: "wishlist", year: null },
      { countryKey: "752", status: "dismissed", year: null },
    ])).toEqual({ "208": "visited", "392": "wishlist" });
  });
  it("fills for compare and union", () => {
    expect(fillsForCompare(["208", "578"], ["578"])).toEqual({ "208": "onlyA", "578": "both" });
    expect(fillsForUnion(["208", "208"])).toEqual({ "208": "visited" });
  });
});

describe("parseYear", () => {
  it("accepts a plain year and clears on empty", () => {
    expect(parseYear("2019", 2026)).toEqual({ ok: true, year: 2019 });
    expect(parseYear(2026, 2026)).toEqual({ ok: true, year: 2026 });
    expect(parseYear("", 2026)).toEqual({ ok: true, year: null });
    expect(parseYear(null, 2026)).toEqual({ ok: true, year: null });
  });
  it("refuses everything else", () => {
    for (const bad of ["abc", "1899", "2027", "2019.5", "20190", 2019.5, {}, " 2019x"]) {
      expect(parseYear(bad, 2026), String(bad)).toEqual({ ok: false });
    }
  });
});

describe("cleanNote", () => {
  it("trims, and blank becomes null", () => {
    expect(cleanNote("  hi  ")).toEqual({ ok: true, note: "hi" });
    expect(cleanNote("   ")).toEqual({ ok: true, note: null });
  });
  it("refuses too long and non-strings", () => {
    expect(cleanNote("x".repeat(NOTE_MAX))).toEqual({ ok: true, note: "x".repeat(NOTE_MAX) });
    expect(cleanNote("x".repeat(NOTE_MAX + 1))).toEqual({ ok: false });
    expect(cleanNote(5)).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run.** `pnpm vitest run src/lib/countries.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/countries.ts`** with the signatures above. No imports beyond the catalog. `parseYear` accepts a number or a string of exactly four digits after trimming.

- [ ] **Step 4: Run.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/countries.ts src/lib/countries.test.ts
git commit -m "feat: pure country stats, selection and input parsing"
```

---

### Task 3: Access rules

**Files:**
- Modify: `src/lib/access-policy.ts` (append after `canAdminister`, and add the rules to the header comment)
- Test: `src/lib/access-policy.test.ts` (append)

**Interfaces:**
- Consumes: `Viewer`, `isSuperAdmin` (existing).
- Produces:

```ts
export type CountriesPerson = { id: string; hasLogin: boolean };
export const canSeeCountries = (_v: Viewer): boolean => true;
export function canEditCountries(v: Viewer, personId: string): boolean;
export function canReadCountryNotes(v: Viewer, person: CountriesPerson): boolean;
export type CountriesTier = "view" | "edit" | "edit_notes";
export function countriesTier(v: Viewer, person: CountriesPerson): CountriesTier;
// What a tier may read. The queries build from these, so a tier can never
// select more than this.
export function tierStatuses(tier: CountriesTier): readonly ("visited" | "wishlist" | "dismissed")[];
export function tierReadsNote(tier: CountriesTier): boolean;
```

- [ ] **Step 1: Append the failing tests** to `src/lib/access-policy.test.ts` (reuse the file's existing viewer factory if it has one; otherwise build viewers inline):

```ts
describe("countries", () => {
  const P = "person-1";
  const owner: Viewer = { userId: "u1", email: "a@x.dk", name: "A", role: "member", personId: P };
  const other: Viewer = { userId: "u2", email: "b@x.dk", name: "B", role: "member", personId: "person-2" };
  const admin: Viewer = { userId: "u3", email: "c@x.dk", name: "C", role: "super_admin", personId: "person-3" };
  const noPerson: Viewer = { userId: "u4", email: "d@x.dk", name: "D", role: "member", personId: null };

  it("who may edit", () => {
    expect(canEditCountries(owner, P)).toBe(true);
    expect(canEditCountries(admin, P)).toBe(true);
    expect(canEditCountries(other, P)).toBe(false);
    expect(canEditCountries(noPerson, P)).toBe(false);
  });
  it("who may read notes", () => {
    expect(canReadCountryNotes(owner, { id: P, hasLogin: true })).toBe(true);
    expect(canReadCountryNotes(admin, { id: P, hasLogin: true })).toBe(false);
    expect(canReadCountryNotes(admin, { id: P, hasLogin: false })).toBe(true);
    expect(canReadCountryNotes(other, { id: P, hasLogin: false })).toBe(false);
    expect(canReadCountryNotes(admin, { id: "person-3", hasLogin: true })).toBe(true);
  });
  it("tiers", () => {
    expect(countriesTier(other, { id: P, hasLogin: true })).toBe("view");
    expect(countriesTier(admin, { id: P, hasLogin: true })).toBe("edit");
    expect(countriesTier(admin, { id: P, hasLogin: false })).toBe("edit_notes");
    expect(countriesTier(owner, { id: P, hasLogin: true })).toBe("edit_notes");
  });
  it("what a tier reads", () => {
    expect(tierStatuses("view")).toEqual(["visited"]);
    expect(tierStatuses("edit")).toEqual(["visited", "wishlist", "dismissed"]);
    expect(tierReadsNote("view")).toBe(false);
    expect(tierReadsNote("edit")).toBe(false);
    expect(tierReadsNote("edit_notes")).toBe(true);
  });
});
```

- [ ] **Step 2: Run.** `pnpm vitest run src/lib/access-policy.test.ts`. Expected: FAIL on the missing exports.
- [ ] **Step 3: Implement** the functions above in `src/lib/access-policy.ts` and add three lines to the header rules comment (who sees maps, who edits, who reads notes and the wishlist).
- [ ] **Step 4: Run.** Same command. Expected: PASS, existing tests included.
- [ ] **Step 5: Commit.**

```bash
git add src/lib/access-policy.ts src/lib/access-policy.test.ts
git commit -m "feat: access rules for country maps"
```

---

### Task 4: Table and migration

**Files:**
- Modify: `src/db/schema.ts` (append `personCountries`)
- Create: one new file under `drizzle/` (generated)

**Interfaces:**
- Produces: `personCountries` Drizzle table with columns `personId` (uuid, FK `people.id`, cascade), `countryKey` (text), `status` (text, not null), `year` (integer, nullable), `note` (text, nullable), `updatedBy` (text, FK `user.id`, set null), `createdAt`, `updatedAt` (timestamps, default now, not null); primary key (`personId`, `countryKey`). SQL names: `person_countries`, `person_id`, `country_key`, `updated_by`, `created_at`, `updated_at`.

- [ ] **Step 1: Add the table** to `src/db/schema.ts`, following the `tripPeople` composite-key pattern, with a comment saying a row is one country for one person, that `status` is `visited`, `wishlist` or `dismissed`, and that `note` and non-visited rows are private (`src/lib/access-policy.ts`).
- [ ] **Step 2: Generate.** `pnpm db:generate`. Expected: one new `drizzle/0004_*.sql` containing only `CREATE TABLE "person_countries"` and its two foreign keys. If it contains any `ALTER` or `DROP` on another table, stop and report.
- [ ] **Step 3: Type-check.** `pnpm check-types`. Expected: no errors.
- [ ] **Step 4: Commit the schema and the SQL file.**

```bash
git add src/db/schema.ts drizzle
git commit -m "feat: person_countries table"
```

- [ ] **Step 5: STOP and ask Patrick before migrating.** `pnpm db:migrate` changes the one database that production also uses. It is additive (a new table nothing deployed reads). Say exactly that, wait for a go, then run `pnpm db:migrate`. Expected output ends without an error; paste the final lines into the report. Tasks 5 onward can be written and unit tested before the go, but nothing that reads the table can be tried in the app until it has run.

---

### Task 5: Which country is this point in

**Files:**
- Create: `src/lib/point-in-country.ts`, `src/lib/country-lookup.ts`
- Test: `src/lib/point-in-country.test.ts`

**Interfaces:**
- Consumes: `shapeKey` from Task 1.
- Produces:

```ts
// src/lib/point-in-country.ts (pure)
export type CountryShape = { key: string; polygons: number[][][][] }; // [polygon][ring][point][lng,lat]
export function toCountryShapes(features: readonly {
  id?: string | number; properties: { name: string };
  geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] } | null;
}[]): CountryShape[];
export function keyAtPoint(shapes: readonly CountryShape[], lat: number, lng: number): string | null;

// src/lib/country-lookup.ts (server-only, memoized)
export async function countryKeyAt(lat: number, lng: number): Promise<string | null>;
```

- [ ] **Step 1: Write the failing test** in `src/lib/point-in-country.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import atlas from "world-atlas/countries-50m.json";
import { keyAtPoint, toCountryShapes } from "./point-in-country";

const topo = atlas as unknown as Parameters<typeof feature>[0];
const collection = feature(topo, (topo as any).objects.countries) as unknown as { features: any[] };
const shapes = toCountryShapes(collection.features);

describe("keyAtPoint", () => {
  it("places real cities", () => {
    expect(keyAtPoint(shapes, 55.68, 12.57)).toBe("208");  // Copenhagen, Denmark
    expect(keyAtPoint(shapes, 64.18, -51.72)).toBe("304"); // Nuuk, Greenland
    expect(keyAtPoint(shapes, 62.01, -6.77)).toBe("234");  // Torshavn, Faroe Islands
    expect(keyAtPoint(shapes, 38.72, -9.14)).toBe("620");  // Lisbon, Portugal
    expect(keyAtPoint(shapes, -33.87, 151.21)).toBe("036"); // Sydney, Australia
  });
  it("respects holes: Lesotho is not South Africa", () => {
    expect(keyAtPoint(shapes, -29.6, 28.2)).toBe("426");
  });
  it("returns null at sea and for nonsense", () => {
    expect(keyAtPoint(shapes, 0, 0)).toBeNull();
    expect(keyAtPoint(shapes, 45, -40)).toBeNull();
    expect(keyAtPoint(shapes, 999, 12)).toBeNull();
    expect(keyAtPoint(shapes, Number.NaN, 12)).toBeNull();
  });
  it("keeps only markable shapes, one per key", () => {
    expect(shapes.every((s) => typeof s.key === "string" && s.key.length > 0)).toBe(true);
    expect(new Set(shapes.map((s) => s.key)).size).toBe(shapes.length);
  });
});
```

- [ ] **Step 2: Run.** `pnpm vitest run src/lib/point-in-country.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `src/lib/point-in-country.ts`.** `toCountryShapes` drops features whose `shapeKey` is `null` or whose geometry is `null`, and merges features sharing a key. `keyAtPoint` returns `null` unless `lat` is finite in [-90, 90] and `lng` finite in [-180, 180]; otherwise even-odd ray casting per polygon (outer ring in, any hole out), first hit wins. A per-polygon bounding box check before the ray cast is allowed.
- [ ] **Step 4: Implement `src/lib/country-lookup.ts`** starting with `import "server-only";`. It loads the atlas and `feature` with `import()` once (module-level promise, reset on failure like `src/components/globe/land.ts`) and calls `keyAtPoint`.
- [ ] **Step 5: Run.** Same command. Expected: PASS. If a real city fails because the simplified coast cuts it off, move the test point a few kilometres inland and say so in the commit body; do not weaken the null cases.
- [ ] **Step 6: Commit.**

```bash
git add src/lib/point-in-country.ts src/lib/point-in-country.test.ts src/lib/country-lookup.ts
git commit -m "feat: find the country a coordinate falls in"
```

---

### Task 6: Queries and server actions

**Files:**
- Create: `src/lib/country-queries.ts`, `src/actions/countries.ts`, `src/lib/country-suggestions.ts`
- Test: `src/lib/country-suggestions.test.ts`

**Interfaces:**
- Consumes: `personCountries` (Task 4); `countriesTier`, `tierStatuses`, `tierReadsNote`, `canEditCountries`, `canReadCountryNotes`, `AccessError` (Task 3); `isCountryKey` (Task 1); `parseYear`, `cleanNote`, `CountryMark` (Task 2); `countryKeyAt` (Task 5); `getViewer`, `visibleTripIds` (existing).
- Produces:

```ts
// src/lib/country-suggestions.ts (pure)
export type SuggestionPoint = { tripId: string; tripTitle: string; tripYear: number; countryName: string | null; lat: number; lng: number };
export type CountrySuggestion = { countryKey: string; tripId: string; tripTitle: string; year: number };
// At most `perGroup` points per (tripId, countryName) group, in input order.
export function samplePoints(points: readonly SuggestionPoint[], perGroup?: number): SuggestionPoint[]; // default 3
// One suggestion per country key: the earliest trip year wins. Keys in `existing` are dropped.
export function pickSuggestions(
  located: readonly { point: SuggestionPoint; countryKey: string | null }[],
  existing: ReadonlySet<string>,
): CountrySuggestion[];

// src/lib/country-queries.ts (server-only)
export type PersonTarget = { id: string; name: string; hasLogin: boolean };
export async function getPersonTarget(personId: string): Promise<PersonTarget | null>;
export async function getPersonCountries(viewer: Viewer, person: PersonTarget):
  Promise<{ tier: CountriesTier; marks: CountryMark[] }>;
export async function getVisitedByPerson(personIds: readonly string[]): Promise<Record<string, string[]>>;
export async function getCountrySuggestions(viewer: Viewer, person: PersonTarget): Promise<CountrySuggestion[]>;

// src/actions/countries.ts ("use server")
export async function setCountryStatus(personId: string, countryKey: string, status: "visited" | "wishlist" | "dismissed", year?: unknown): Promise<void>;
export async function setCountryYear(personId: string, countryKey: string, year: unknown): Promise<void>;
export async function setCountryNote(personId: string, countryKey: string, note: unknown): Promise<void>;
export async function removeCountry(personId: string, countryKey: string): Promise<void>;
```

- [ ] **Step 1: Write the failing test** in `src/lib/country-suggestions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickSuggestions, samplePoints, type SuggestionPoint } from "./country-suggestions";

const p = (tripId: string, tripYear: number, countryName: string | null, lat = 1, lng = 1): SuggestionPoint =>
  ({ tripId, tripTitle: `Trip ${tripId}`, tripYear, countryName, lat, lng });

describe("samplePoints", () => {
  it("keeps at most three per trip and country name", () => {
    const pts = [p("t1", 2024, "Portugal"), p("t1", 2024, "Portugal"), p("t1", 2024, "Portugal"), p("t1", 2024, "Portugal"), p("t1", 2024, "Spain"), p("t2", 2020, "Portugal")];
    expect(samplePoints(pts)).toHaveLength(5);
  });
  it("treats a missing country name as its own group", () => {
    expect(samplePoints([p("t1", 2024, null), p("t1", 2024, null)], 1)).toHaveLength(1);
  });
});

describe("pickSuggestions", () => {
  it("one per country, earliest year wins, existing dropped, misses skipped", () => {
    const out = pickSuggestions(
      [
        { point: p("t1", 2024, "Portugal"), countryKey: "620" },
        { point: p("t2", 2020, "Portugal"), countryKey: "620" },
        { point: p("t1", 2024, "Spain"), countryKey: "724" },
        { point: p("t3", 2022, "Norway"), countryKey: "578" },
        { point: p("t3", 2022, null), countryKey: null },
      ],
      new Set(["724"]),
    );
    expect(out).toEqual([
      { countryKey: "620", tripId: "t2", tripTitle: "Trip t2", year: 2020 },
      { countryKey: "578", tripId: "t3", tripTitle: "Trip t3", year: 2022 },
    ]);
  });
  it("is empty for no input", () => {
    expect(pickSuggestions([], new Set())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run.** `pnpm vitest run src/lib/country-suggestions.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `src/lib/country-suggestions.ts`.** Output order: by first appearance of the country key in `located`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Implement `src/lib/country-queries.ts`** (`import "server-only";`):
  - `getPersonTarget`: the `people` row plus `hasLogin` = a `members` row with that `personId` exists. `null` when the person does not exist.
  - `getPersonCountries`: `tier = countriesTier(viewer, person)`. Select `countryKey`, `status`, `year`, and `note` only when `tierReadsNote(tier)`; `where personId = ? and status in tierStatuses(tier)`. The column list and the status filter must be built from those two functions, not from the tier name. A row's `note` key is absent (not `null`) when the tier may not read notes.
  - `getVisitedByPerson`: `status = 'visited'` rows for the given people, grouped by person id; every requested id is present in the result, with `[]` when empty. Empty input returns `{}` without a query.
  - `getCountrySuggestions`: returns `[]` unless `canEditCountries(viewer, person.id)`. Trip ids = `trip_people` rows for the person, intersected with `visibleTripIds(viewer)` unless it is `"all"`. Photos of those trips with non-null `lat` and `lng` joined to their trip for `title` and `startDate` (year = first four characters of `startDate`). Then `samplePoints`, `countryKeyAt` for each, and `pickSuggestions` with every existing `countryKey` of that person (all statuses, read directly, not through the tier).
- [ ] **Step 6: Implement `src/actions/countries.ts`** following `src/actions/people.ts`. Shared private helper `requireEdit(personId)`: `getViewer()`, `getPersonTarget(personId)` (throw `Error("Person not found")` when null), `canEditCountries` else `throw new AccessError()`. Every action first checks `isCountryKey(countryKey)` and throws `Error("Unknown country")` otherwise. Behaviour:
  - `setCountryStatus`: status must be one of the three literals. Upsert on (`personId`, `countryKey`). `year` goes through `parseYear(year, new Date().getUTCFullYear())` and is stored only when status is `visited`; any other status stores `year: null`. An existing `note` is kept. Sets `updatedBy` and `updatedAt`.
  - `setCountryYear`: `parseYear`; refused input throws `Error("Enter a year like 2019")`. Updates only a row whose status is `visited`; no row means no write.
  - `setCountryNote`: requires `canReadCountryNotes(viewer, person)` else `AccessError`. `cleanNote`; refused input throws `Error("Note is too long")`. Updates an existing row only.
  - `removeCountry`: deletes the row.
  - Each ends with `revalidatePath("/countries")`.
- [ ] **Step 7: Type-check.** `pnpm check-types`. Expected: no errors.
- [ ] **Step 8: Commit.**

```bash
git add src/lib/country-suggestions.ts src/lib/country-suggestions.test.ts src/lib/country-queries.ts src/actions/countries.ts
git commit -m "feat: country queries, suggestions and actions"
```

---

### Task 7: The page without the map

The feature is fully usable after this task: pick a person, mark countries from the list, see stats, add suggestions, edit year and note.

**Files:**
- Modify: `src/lib/nav.ts`, `src/lib/nav.test.ts`, `src/components/site/AppNav.tsx`, `src/app/globals.css`
- Create: `src/app/(app)/countries/page.tsx`, `src/components/countries/CountriesPicker.tsx`, `CountriesView.tsx`, `CountryStatsPanel.tsx`, `CountryList.tsx`, `CountryCard.tsx`, `SuggestionChips.tsx` (all under `src/components/countries/`)
- Test: `src/lib/nav.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1, 2, 3 and 6; `parsePersonParam`, `personQuery`, `togglePerson` (`src/lib/person-filter.ts`); `getAllPeople` (`src/lib/queries.ts`).
- Produces:

```ts
// src/components/countries/CountriesView.tsx ("use client")
export type CountriesViewProps =
  | { mode: "single"; person: { id: string; name: string }; tier: CountriesTier; marks: CountryMark[]; suggestions: CountrySuggestion[] }
  | { mode: "compare"; a: { id: string; name: string; visited: string[] }; b: { id: string; name: string; visited: string[] } }
  | { mode: "union"; label: string; visited: string[] };
export function CountriesView(props: CountriesViewProps): JSX.Element;
// Slot Task 8 fills: CountriesView renders <CountriesMap fills={...} onPick={...} /> above the stats.
```

- [ ] **Step 1: Extend the nav test** in `src/lib/nav.test.ts`: `activeSection("/countries")` is `"countries"`, and `NAV_TABS` contains `{ key: "countries", href: "/countries", label: "Countries" }` directly after the `map` tab.
- [ ] **Step 2: Run.** `pnpm vitest run src/lib/nav.test.ts`. Expected: FAIL.
- [ ] **Step 3: Update `src/lib/nav.ts`** (`NavSection`, `NavTab.href`, `NAV_TABS`, `ROOTS`) and `src/components/site/AppNav.tsx`: widen the `SheetLink` href union with `"/countries"` and add a "Countries" link at the top of the phone "More" sheet with a globe icon from `lucide-react`. The bottom tab bar is unchanged.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Write the page** `src/app/(app)/countries/page.tsx`: `getViewer()`, read `person` (through `parsePersonParam`) and `view` (`"family"` means family) from `searchParams`, `getAllPeople()`, `resolveSelection`, then load exactly what the mode needs (`getPersonTarget` + `getPersonCountries` + `getCountrySuggestions` for single; `getVisitedByPerson` for compare and union) and render `CountriesPicker` and `CountriesView`. Heading `Countries` in the same `font-hand text-4xl` style as `src/app/(app)/people/page.tsx`. When `viewer.personId` is null, show one line under the heading: "You are not linked to a person yet, so you have no map of your own. An admin can link you on the Members page."
- [ ] **Step 6: Write `CountriesPicker`** (server component, plain links, chip classes copied from `src/components/timeline/PersonFilter.tsx`): chips "Me" (`/countries`, only when the viewer has a person), "Family" (`/countries?view=family`), then one chip per person toggling it in the `person` list via `togglePerson` and `personQuery`. `aria-label="Whose countries"`, `aria-current` on active chips. A caption under the chips says "Pick two people to compare" when exactly one is picked.
- [ ] **Step 7: Write the client components.** Load the `impeccable` skill for the look and `frontend-ui-patterns` for exact numbers before writing them. Fixed requirements:
  - `CountriesView` owns the marks in state and applies changes optimistically with `useOptimistic` or equivalent, calling the Task 6 actions inside a transition; a failed action restores the previous state and shows a `sonner` toast with the error message. While a change is pending, its root carries `data-unsaved-work`.
  - `CountryStatsPanel` renders `countryStats(...)`: "N countries and territories", "N of {unTotal} UN countries", "{percent}% of the world", and one row per continent `visited/total`. In compare mode it shows the two totals and the three partition counts.
  - `CountryList`: a search input (`aria-label="Search countries"`) filtering by name, case-insensitive, also matching without diacritics; countries grouped under continent headings in `CONTINENTS` order. In single mode with an edit tier each row is a checkbox whose accessible name is the country name and whose checked state is "visited"; the row also shows the year and a "Want to go" marker. In `view` tier, compare and union the rows are read-only and show only visited state (compare shows which person).
  - `CountryCard` opens for one country (from a list row's details button, and later from a map tap): flag, name, and for an edit tier buttons "Visited", "Want to go", "Remove", a year field (`inputMode="numeric"`, saved on blur or Enter through `setCountryYear`, with the action's error shown inline), and a note field only when the tier is `edit_notes` (`maxLength={NOTE_MAX}`). For `view` tier: name, "Visited", and the year when set.
  - `SuggestionChips`: heading "From your vacations", one chip per suggestion "+ {country name}" with the vacation title as secondary text, and a dismiss button per chip (`aria-label="Dismiss {country name}"`). Add calls `setCountryStatus(personId, key, "visited", year)`; dismiss calls it with `"dismissed"`. Rendered only when there are suggestions.
  - Fill colours are CSS variables added to `src/app/globals.css` inside the existing theme: `--country-visited`, `--country-wishlist`, `--country-a`, `--country-b`, `--country-both`, `--country-land`, `--country-sea`. The list markers use them too, and state is never shown by colour alone.
- [ ] **Step 8: Regenerate routes and gate.** `pnpm build`, then `pnpm check-types`, then `pnpm test`. Expected: all pass. Paste the last lines of each.
- [ ] **Step 9: Try it for real.** With the migration from Task 4 applied, `pnpm dev` (background), sign in, and confirm in the running app: marking Denmark from the list raises the count and survives a reload; a second person's map shows no wishlist entries of the first; a year of `1899` is refused inline. Because sign-in is passkey or magic link, ask Patrick to do this click-through and report what he sees.
- [ ] **Step 10: Commit.**

```bash
git add src/lib/nav.ts src/lib/nav.test.ts src/components/site/AppNav.tsx src/app/globals.css "src/app/(app)/countries" src/components/countries
git commit -m "feat: countries page with list, stats and suggestions"
```

---

### Task 8: The map

**Files:**
- Create: `src/components/countries/CountriesMap.tsx`, `src/components/countries/CountriesMapInner.tsx`, `src/lib/country-map-style.ts`
- Modify: `src/components/countries/CountriesView.tsx`
- Test: `src/lib/country-map-style.test.ts`

**Interfaces:**
- Consumes: `FillState` (Task 2), `shapeKey` (Task 1), the CSS variables from Task 7.
- Produces:

```ts
// src/lib/country-map-style.ts (pure)
export type MapColors = { sea: string; land: string; border: string } & Record<FillState, string>;
// A complete MapLibre style: background, one geojson source "countries", fill layer
// "country-fill", line layer "country-line". No sprite, no glyphs, no external URL.
export function countryMapStyle(colors: MapColors): StyleSpecification;
// Feature-state value per key, for map.setFeatureState.
export function fillStateEntries(fills: Record<string, FillState>, allKeys: readonly string[]):
  { key: string; fill: FillState | "none" }[];

// src/components/countries/CountriesMap.tsx ("use client"; next/dynamic, ssr: false, of CountriesMapInner)
export function CountriesMap(props: {
  fills: Record<string, FillState>;
  onPick?: (countryKey: string) => void;      // omitted means read-only
  projection: "mercator" | "globe";
  onProjectionChange: (p: "mercator" | "globe") => void;
  mapRef?: React.Ref<{ getCanvas(): HTMLCanvasElement } | null>;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing test** in `src/lib/country-map-style.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countryMapStyle, fillStateEntries } from "./country-map-style";

const colors = { sea: "#eee", land: "#ddd", border: "#ccc", visited: "#1", wishlist: "#2", onlyA: "#3", onlyB: "#4", both: "#5" };

describe("countryMapStyle", () => {
  it("is self-contained", () => {
    const style = countryMapStyle(colors);
    const text = JSON.stringify(style);
    expect(text).not.toMatch(/https?:/);
    expect(style.sprite).toBeUndefined();
    expect(style.glyphs).toBeUndefined();
    expect(style.layers.map((l) => l.id)).toEqual(["background", "country-fill", "country-line"]);
    expect(Object.keys(style.sources)).toEqual(["countries"]);
  });
});

describe("fillStateEntries", () => {
  it("covers every key so a removed mark is cleared", () => {
    expect(fillStateEntries({ "208": "visited" }, ["208", "578"])).toEqual([
      { key: "208", fill: "visited" },
      { key: "578", fill: "none" },
    ]);
  });
});
```

- [ ] **Step 2: Run.** `pnpm vitest run src/lib/country-map-style.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `src/lib/country-map-style.ts`.** The fill layer's `fill-color` is a `case` expression on `["feature-state", "fill"]` with `colors.land` as the default, and a `fill-color-transition` of the duration `frontend-ui-patterns` gives for a state change. The source is declared with empty data and `promoteId: "key"`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Implement `CountriesMapInner`** with `Map` from `react-map-gl/maplibre` (see `src/components/map/PhotosMap.tsx` for the import and CSS). Requirements:
  - Shapes: `import("world-atlas/countries-50m.json")` and `import("topojson-client")` inside an effect; convert with `feature`, write `properties.key = shapeKey(feature)` on each, drop nothing (non-markable shapes keep no key and stay land colour), then `setData` on the source.
  - Colours: read the CSS variables with `getComputedStyle(document.documentElement)` once on mount and pass them to `countryMapStyle`.
  - Fills: on every `fills` change call `setFeatureState({ source: "countries", id: key }, { fill })` for each entry of `fillStateEntries`.
  - Tap: `interactiveLayerIds={["country-fill"]}`; a click on a feature with a `key` calls `onPick(key)`. Without `onPick` the cursor stays default and clicks do nothing.
  - View: starts showing the whole world; `minZoom` so the world cannot shrink below the frame; `renderWorldCopies` off; `dragRotate` and pitch off in the flat view.
  - Projection: pass `projection` to `Map`. A segmented control "Flat" and "Globe" (`role="radiogroup"`, `aria-label="Map view"`) calls `onProjectionChange`. First, confirm in the running app that the globe renders with the installed `maplibre-gl`; if it does not, remove the control and the prop, keep the flat map, and record it in the Task 10 docs step.
  - Reduced motion (`prefers-reduced-motion: reduce`): no camera animation and a zero-length fill transition.
  - No WebGL (`maplibregl.supported` false, or map error on init): render "The map needs WebGL. The list below works without it." in the map frame.
  - Accessibility: the map container has `role="img"` and `aria-label="World map of visited countries"`; nothing is reachable only through the map.
- [ ] **Step 6: Wire it into `CountriesView`**: fills from `fillsForMarks`, `fillsForCompare` or `fillsForUnion`; `onPick` (edit tiers in single mode only) marks an unmarked country visited at once and opens `CountryCard` for it; in other modes a tap only opens the read-only card. Projection choice lives in `CountriesView` state and is remembered in `localStorage` inside try/catch.
- [ ] **Step 7: Check the bundle rule.** Only `CountriesMapInner.tsx` may import the map library or the shapes, and only `CountriesMap.tsx` may import `CountriesMapInner` (through `next/dynamic` with `ssr: false`). Run `grep -rlE "maplibre|world-atlas|topojson-client" src/components/countries "src/app/(app)/countries" src/lib/country-map-style.ts src/lib/countries.ts src/lib/country-catalog.ts`. Expected output: `src/components/countries/CountriesMapInner.tsx`, plus `src/lib/country-map-style.ts` only if its sole match is an `import type` line. Paste the output. Then `pnpm build` and confirm it succeeds.
- [ ] **Step 8: Gate.** `pnpm check-types` and `pnpm test`. Expected: pass.
- [ ] **Step 9: Try it for real.** Ask Patrick to click through on a phone-width window and a desktop: tap Portugal marks it and the fill fades in; pinch zoom; switch to Globe and back; a second person's map is read-only. Report what he sees.
- [ ] **Step 10: Commit.**

```bash
git add src/lib/country-map-style.ts src/lib/country-map-style.test.ts src/components/countries
git commit -m "feat: world map for the countries page"
```

---

### Task 9: Share as image

**Files:**
- Create: `src/lib/share-map-image.ts`, `src/components/countries/ShareMapButton.tsx`
- Modify: `src/components/countries/CountriesView.tsx`, `src/components/countries/CountriesMapInner.tsx`
- Test: `src/lib/share-map-image.test.ts`

**Interfaces:**
- Consumes: `CountryStats` (Task 2), the `mapRef` prop of `CountriesMap` (Task 8).
- Produces:

```ts
// src/lib/share-map-image.ts
export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 1500;
// Text for the image. First name only: the first word of the name.
export function shareLines(name: string, stats: CountryStats): { title: string; lines: string[] };
export function shareFileName(name: string): string; // "countries-<first-name-lowercase-ascii>.png"
export async function composeShareImage(map: HTMLCanvasElement, name: string, stats: CountryStats): Promise<Blob>;
```

- [ ] **Step 1: Write the failing test** in `src/lib/share-map-image.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countryStats } from "./countries";
import { shareFileName, shareLines } from "./share-map-image";

describe("share image text", () => {
  it("uses the first name and the numbers only", () => {
    const out = shareLines("Anna Marie Jensen", countryStats(["208", "304", "578"]));
    expect(out.title).toBe("Anna has been to");
    expect(out.lines).toEqual(["3 countries and territories", "2 of 193 UN countries", "1% of the world"]);
  });
  it("names the family map", () => {
    expect(shareLines("Family", countryStats([])).title).toBe("Family has been to");
  });
  it("builds a safe file name", () => {
    expect(shareFileName("Søren Ø.")).toBe("countries-soren.png");
    expect(shareFileName("  ")).toBe("countries-map.png");
  });
});
```

- [ ] **Step 2: Run.** `pnpm vitest run src/lib/share-map-image.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `src/lib/share-map-image.ts`.** `composeShareImage` draws onto a `SHARE_WIDTH` by `SHARE_HEIGHT` 2D canvas: paper background, the map canvas scaled to fit the top area (contain, centred), then the title and lines, and "Memories" small in a corner. It returns `canvas.toBlob` as PNG. `shareFileName` strips diacritics (`normalize("NFD")`), maps `ø` to `o`, `æ` to `ae`, `å` to `a`, keeps `[a-z0-9]`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Make the map canvas readable.** In `CountriesMapInner` either create the map with `canvasContextAttributes: { preserveDrawingBuffer: true }`, or capture inside a `render` event right after `triggerRepaint()`. Use the first if the installed `maplibre-gl` accepts that option; state which one was used in the commit body.
- [ ] **Step 6: Write `ShareMapButton`** ("Share map", shown in single and union modes only, never in compare). On click: `composeShareImage`, then if `navigator.canShare?.({ files: [file] })` call `navigator.share({ files: [file] })`, otherwise download through an object URL that is revoked afterwards. A cancelled share (`AbortError`) is silent; any other failure shows a toast "Could not make the image". The image is never uploaded.
- [ ] **Step 7: Gate.** `pnpm check-types` and `pnpm test`. Expected: pass.
- [ ] **Step 8: Try it for real.** Ask Patrick to press "Share map" on desktop (a PNG downloads) and on his phone (the share sheet opens), and to confirm the image shows the map, a first name and three number lines and nothing else.
- [ ] **Step 9: Commit.**

```bash
git add src/lib/share-map-image.ts src/lib/share-map-image.test.ts src/components/countries
git commit -m "feat: share a countries map as an image"
```

---

### Task 10: Docs and the full gate

**Files:**
- Modify: `CLAUDE.md`, `docs/free-vs-premium.md`

- [ ] **Step 1: Add a "Countries" fact to `CLAUDE.md`** under "Facts a session needs", in the style of its neighbours: the table, the three tiers and where they live, wishlist and notes are private, keys are strings with leading zeros, the catalog is generated by `node scripts/gen-country-catalog.mjs` and never hand-edited, the shapes and MapLibre load lazily, suggestions come from point-in-polygon and only for editors.
- [ ] **Step 2: Update `docs/free-vs-premium.md`**: every "Countries" row that was built changes status from `planned` to `built`. If the globe switch was dropped in Task 8, its row stays `planned` with the reason in one clause. Check `docs/superpowers/specs/2026-11-19-where-have-i-been-design.md` for any statement the build made untrue and correct it in the same commit.
- [ ] **Step 3: Full gate.** `pnpm verify` (background, it builds). Expected: build, type-check and tests all pass. Paste the final lines. A Turbopack "failed to receive message" crash is not a code error: rerun once.
- [ ] **Step 4: Script tests.** `pnpm test:scripts`. Expected: pass.
- [ ] **Step 5: Commit.**

```bash
git add CLAUDE.md docs/free-vs-premium.md docs/superpowers/specs/2026-11-19-where-have-i-been-design.md
git commit -m "docs: countries feature facts and status"
```

- [ ] **Step 6: Open a draft pull request** (`gh pr create --draft`) from `feat/countries` only when Patrick asks. Merging to `main` deploys to production, so it is his call.
