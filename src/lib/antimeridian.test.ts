import { describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import atlas from "world-atlas/countries-50m.json";
import { maxLngStep, unwrapPolygon, unwrapRing } from "./antimeridian";

const topo = atlas as unknown as Parameters<typeof feature>[0];
const collection = feature(topo, (topo as any).objects.countries) as unknown as { features: any[] };

const polygonsOf = (f: any): number[][][][] =>
  !f.geometry ? [] : f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;

const unwrapped = (id: string): number[][][][] =>
  collection.features.filter((f) => f.id === id).flatMap(polygonsOf).map(unwrapPolygon);

const points = (polys: number[][][][]) => polys.flat(2);
const maxLngOf = (polys: number[][][][]) => Math.max(...points(polys).map((p) => p[0]));
const minLatOf = (polys: number[][][][]) => Math.min(...points(polys).map((p) => p[1]));

describe("maxLngStep", () => {
  it("is the largest longitude step between neighbours", () => {
    expect(maxLngStep([[0, 0], [10, 0], [5, 1]])).toBe(10);
    expect(maxLngStep([[179, 60], [-180, 60]])).toBe(359);
    expect(maxLngStep([])).toBe(0);
  });
});

describe("unwrapRing", () => {
  it("leaves a ring that never crosses the antimeridian alone", () => {
    const ring = [[10, 50], [12, 50], [12, 52], [10, 50]];
    expect(unwrapRing(ring)).toEqual(ring);
  });

  it("moves the far side of a ring that crosses twice east, past 180", () => {
    const ring = [[170, 60], [-170, 60], [-170, 65], [170, 65], [170, 60]];
    expect(unwrapRing(ring)).toEqual([[170, 60], [190, 60], [190, 65], [170, 65], [170, 60]]);
  });

  it("closes a ring that circles a pole along that pole", () => {
    // A cap around the south pole, crossing once.
    const ring = [[0, -70], [90, -70], [179, -70], [-179, -70], [-90, -70], [0, -70]];
    const out = unwrapRing(ring);
    expect(maxLngStep(out)).toBeLessThanOrEqual(180);
    expect(out[0]).toEqual(out.at(-1));
    expect(Math.min(...out.map((p) => p[1]))).toBe(-90);
    // Pole points at most 90 degrees apart.
    const pole = out.filter((p) => p[1] === -90);
    for (let i = 1; i < pole.length; i++) expect(Math.abs(pole[i][0] - pole[i - 1][0])).toBeLessThanOrEqual(90);
  });

  it("closes a northern cap along the north pole", () => {
    const ring = [[0, 80], [179, 80], [-179, 80], [0, 80]];
    expect(Math.max(...unwrapRing(ring).map((p) => p[1]))).toBe(90);
  });
});

describe("unwrapPolygon", () => {
  it("moves holes with an outer ring moved east", () => {
    const outer = [[170, 60], [-170, 60], [-170, 70], [170, 70], [170, 60]];
    const hole = [[-175, 64], [-174, 64], [-174, 65], [-175, 64]];
    expect(unwrapPolygon([outer, hole])[1]).toEqual([[185, 64], [186, 64], [186, 65], [185, 64]]);
  });

  it("makes the coast the outer ring when a pole cut is the outer ring", () => {
    // As world-atlas cuts Antarctica: a tiny circle at the pole, the coast a hole.
    const cut = [[-180, -89.999], [90, -89.999], [0, -89.999], [-90, -89.999], [-180, -89.999]];
    const coast = [[-180, -70], [-90, -70], [0, -70], [90, -70], [179, -70], [-180, -70]];
    const out = unwrapPolygon([cut, coast]);
    expect(out).toHaveLength(1);
    expect(Math.max(...out[0].map((p) => p[1]))).toBe(-70);
    expect(Math.min(...out[0].map((p) => p[1]))).toBe(-90);
  });
});

describe("the converted world-atlas shapes", () => {
  it("have no ring with a step over 180 degrees after unwrapping", () => {
    let rings = 0;
    for (const f of collection.features) {
      for (const polygon of polygonsOf(f)) {
        for (const ring of unwrapPolygon(polygon)) {
          rings++;
          expect(maxLngStep(ring), `${f.id} ${f.properties?.name}`).toBeLessThanOrEqual(180);
        }
      }
    }
    expect(rings).toBeGreaterThan(1000);
  });

  it("moves Chukotka east instead of dropping it", () => {
    expect(maxLngOf(unwrapped("643"))).toBeGreaterThan(180);
  });

  it("closes Antarctica along the south pole", () => {
    expect(minLatOf(unwrapped("010"))).toBe(-90);
  });

  it("does not touch the input", () => {
    const f = collection.features.find((x) => x.id === "643");
    const before = JSON.stringify(f.geometry);
    unwrapped("643");
    expect(JSON.stringify(f.geometry)).toBe(before);
  });
});
