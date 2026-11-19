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

test("buildCatalog: UN observers the dataset flags as members are not counted", () => {
  const shapes = [{ id: "336", properties: { name: "Vatican" } }];
  const dataset = [
    { ccn3: "336", name: { common: "Vatican City" }, flag: "VA", region: "Europe", subregion: "Southern Europe", unMember: true },
  ];
  const entry = buildCatalog(shapes, dataset).find((c) => c.key === "336");
  assert.ok(entry);
  assert.equal(entry.unMember, false);
  assert.equal(entry.hasShape, true);
});
