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
