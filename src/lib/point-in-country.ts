import { shapeKey } from "./country-catalog";

export type CountryShape = { key: string; polygons: number[][][][] }; // [polygon][ring][point][lng,lat]

type Feature = {
  id?: string | number;
  properties: { name: string };
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] }
    | null;
};

export function toCountryShapes(features: readonly Feature[]): CountryShape[] {
  const byKey = new Map<string, CountryShape>();
  for (const f of features) {
    if (!f.geometry) continue;
    const key = shapeKey(f);
    if (key === null) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const existing = byKey.get(key);
    if (existing) existing.polygons.push(...polys);
    else byKey.set(key, { key, polygons: [...polys] });
  }
  return [...byKey.values()];
}

// Even-odd ray cast: true when the point is inside an odd number of rings.
function inRing(ring: number[][], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Outer ring in, any hole out.
function inPolygon(polygon: number[][][], lng: number, lat: number): boolean {
  if (!inRing(polygon[0], lng, lat)) return false;
  for (let i = 1; i < polygon.length; i++) if (inRing(polygon[i], lng, lat)) return false;
  return true;
}

export function keyAtPoint(shapes: readonly CountryShape[], lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  for (const shape of shapes) {
    for (const polygon of shape.polygons) if (inPolygon(polygon, lng, lat)) return shape.key;
  }
  return null;
}
