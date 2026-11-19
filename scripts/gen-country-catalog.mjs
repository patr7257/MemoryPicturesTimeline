#!/usr/bin/env node
// Builds src/lib/country-catalog.json: the countries a member can mark as
// visited. Joins the map shapes (world-atlas, keyed by ISO 3166-1 numeric id)
// with the world-countries dataset (names, flags, regions, UN membership).
// The JSON is generated: never edit it by hand, fix this script and rerun it.
//
// Usage, from the repo root: node scripts/gen-country-catalog.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Shapes the atlas ships without an id, that are still worth marking.
const SLUGS = {
  Kosovo: { key: "kosovo", continent: "Europe", dataset: "XK" },
  "N. Cyprus": { key: "n-cyprus", name: "Northern Cyprus", continent: "Europe" },
  Somaliland: { key: "somaliland", continent: "Africa" },
};

// Vatican City (Holy See) is a UN observer, not a member, but the dataset flags it as one.
export const NOT_UN_MEMBERS = new Set(["336"]);

/** Maps a world-countries region/subregion to one of the seven continents. */
export function continentOf({ region, subregion }) {
  if (region === "Americas") return subregion === "South America" ? "South America" : "North America";
  if (region === "Antarctic") return "Antarctica";
  return region;
}

/** Catalog entries from raw map shapes plus the world-countries dataset, unsorted. */
export function buildCatalog(shapes, dataset) {
  const byNumeric = new Map(dataset.filter((d) => d.ccn3).map((d) => [d.ccn3, d]));
  const entries = new Map();

  for (const shape of shapes) {
    const id = shape.id;
    if (typeof id === "string" && id !== "") {
      const d = byNumeric.get(id);
      if (!d || entries.has(id)) continue;
      entries.set(id, {
        key: id,
        name: d.name.common,
        flag: d.flag,
        continent: continentOf(d),
        unMember: d.unMember === true && !NOT_UN_MEMBERS.has(id),
        hasShape: true,
      });
      continue;
    }
    const slug = SLUGS[shape.properties.name];
    if (!slug || entries.has(slug.key)) continue;
    const d = slug.dataset ? dataset.find((x) => x.cca2 === slug.dataset) : undefined;
    entries.set(slug.key, {
      key: slug.key,
      name: slug.name ?? shape.properties.name,
      flag: d?.flag ?? "",
      continent: slug.continent,
      unMember: false,
      hasShape: true,
    });
  }

  for (const d of dataset) {
    if (d.unMember !== true || !d.ccn3 || entries.has(d.ccn3)) continue;
    entries.set(d.ccn3, {
      key: d.ccn3,
      name: d.name.common,
      flag: d.flag,
      continent: continentOf(d),
      unMember: !NOT_UN_MEMBERS.has(d.ccn3),
      hasShape: false,
    });
  }

  return [...entries.values()];
}

function main() {
  const root = process.cwd();
  const atlas = JSON.parse(readFileSync(path.join(root, "node_modules/world-atlas/countries-50m.json"), "utf8"));
  const dataset = createRequire(path.join(root, "package.json"))("world-countries");
  const catalog = buildCatalog(atlas.objects.countries.geometries, dataset).sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  );
  writeFileSync(path.join(root, "src/lib/country-catalog.json"), JSON.stringify(catalog, null, 2) + "\n", {
    encoding: "utf8",
  });
  console.log(`wrote ${catalog.length} entries (${catalog.filter((c) => c.unMember).length} UN members)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
