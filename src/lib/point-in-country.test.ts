import { describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import atlas from "world-atlas/countries-50m.json";
import { keyAtPoint, nearestKeyWithin, resolveKey, toCountryShapes } from "./point-in-country";

const topo = atlas as unknown as Parameters<typeof feature>[0];
const collection = feature(topo, (topo as any).objects.countries) as unknown as { features: any[] };
const shapes = toCountryShapes(collection.features);

describe("keyAtPoint", () => {
  it("places real cities", () => {
    expect(keyAtPoint(shapes, 55.68, 12.52)).toBe("208");  // Copenhagen, Denmark
    expect(keyAtPoint(shapes, 64.18, -51.6)).toBe("304"); // Nuuk, Greenland
    expect(keyAtPoint(shapes, 62.01, -6.77)).toBe("234");  // Torshavn, Faroe Islands
    expect(keyAtPoint(shapes, 38.72, -9.05)).toBe("620");  // Lisbon, Portugal
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

describe("resolveKey", () => {
  it("places city centres the simplified coast leaves in the sea", () => {
    expect(keyAtPoint(shapes, 55.68, 12.57)).toBeNull();   // Copenhagen centre, strict
    expect(resolveKey(shapes, 55.68, 12.57)).toBe("208");  // Copenhagen, Denmark
    expect(resolveKey(shapes, 64.18, -51.72)).toBe("304"); // Nuuk, Greenland
    expect(resolveKey(shapes, 38.72, -9.14)).toBe("620");  // Lisbon, Portugal
  });
  it("keeps points inside a country unchanged", () => {
    expect(resolveKey(shapes, -29.6, 28.2)).toBe("426");   // Lesotho, not South Africa
    expect(resolveKey(shapes, -33.87, 151.21)).toBe("036");
  });
  it("stays null far from any coast and for nonsense", () => {
    expect(resolveKey(shapes, 0, 0)).toBeNull();
    expect(resolveKey(shapes, 45, -40)).toBeNull();
    expect(resolveKey(shapes, 56.0, 6.0)).toBeNull();      // North Sea, over 100 km from Denmark
    expect(resolveKey(shapes, 999, 12)).toBeNull();
    expect(resolveKey(shapes, Number.NaN, 12)).toBeNull();
  });
});

describe("nearestKeyWithin", () => {
  it("respects the distance limit", () => {
    expect(nearestKeyWithin(shapes, 55.68, 12.57, 25)).toBe("208");
    expect(nearestKeyWithin(shapes, 55.68, 12.57, 0)).toBeNull();
    expect(nearestKeyWithin(shapes, 56.0, 6.0, 25)).toBeNull();
  });
});
