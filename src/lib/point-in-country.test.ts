import { describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import atlas from "world-atlas/countries-50m.json";
import { keyAtPoint, nearestKeyWithin, resolveKey, toCountryShapes, type CountryShape } from "./point-in-country";

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

describe("stored bounding boxes", () => {
  // A 10 by 10 square with a 2 by 2 hole in the middle.
  const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  const shape = (box: [number, number, number, number]): CountryShape[] => [
    { key: "X", polygons: [[square, hole]], boxes: [box] },
  ];

  it("gives every real polygon its box once, outer ring extent", () => {
    expect(shapes.every((s) => s.boxes.length === s.polygons.length)).toBe(true);
    const dk = shapes.find((s) => s.key === "208");
    expect(dk?.boxes.some(([minX, minY, maxX, maxY]) => minX < 12.5 && maxX > 12.5 && minY < 55.7 && maxY > 55.7)).toBe(true);
  });

  it("uses the stored box: a point outside it is never ray cast", () => {
    // The box is deliberately wrong, so only a box check explains a null.
    expect(keyAtPoint(shape([20, 20, 30, 30]), 2, 2)).toBeNull();
    expect(nearestKeyWithin(shape([20, 20, 30, 30]), 0.1, 2, 25)).toBeNull();
  });

  it("still ray casts inside the box, holes included", () => {
    const ok = shape([0, 0, 10, 10]);
    expect(keyAtPoint(ok, 2, 2)).toBe("X");
    expect(keyAtPoint(ok, 5, 5)).toBeNull();
    expect(keyAtPoint(ok, 50, 50)).toBeNull();
    expect(nearestKeyWithin(ok, 0.1, 2, 25)).toBe("X");
  });
});
