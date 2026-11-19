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

export const NEAR_COAST_KM = 25;

const KM_PER_DEG = 111.32;

// Distance in km from the point to a segment, on a local flat approximation.
function segmentKm(
  [x1, y1]: number[],
  [x2, y2]: number[],
  lng: number,
  lat: number,
  kx: number,
): number {
  const px = (lng - x1) * kx;
  const py = (lat - y1) * KM_PER_DEG;
  const dx = (x2 - x1) * kx;
  const dy = (y2 - y1) * KM_PER_DEG;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
  return Math.hypot(px - t * dx, py - t * dy);
}

// Key of the shape whose outline is nearest to the point, when that distance is at most maxKm; otherwise null.
export function nearestKeyWithin(
  shapes: readonly CountryShape[],
  lat: number,
  lng: number,
  maxKm: number,
): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const kx = KM_PER_DEG * Math.cos((lat * Math.PI) / 180);
  const dLat = maxKm / KM_PER_DEG;
  const dLng = kx > 1e-9 ? maxKm / kx : Infinity;
  let bestKey: string | null = null;
  let best = Infinity;
  for (const shape of shapes) {
    for (const polygon of shape.polygons) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of polygon[0]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (lat < minY - dLat || lat > maxY + dLat || lng < minX - dLng || lng > maxX + dLng) continue;
      for (const ring of polygon) {
        for (let i = 1; i < ring.length; i++) {
          const d = segmentKm(ring[i - 1], ring[i], lng, lat, kx);
          if (d < best) {
            best = d;
            bestKey = shape.key;
          }
        }
      }
    }
  }
  return best <= maxKm ? bestKey : null;
}

// The shape containing the point, else the nearest shape within NEAR_COAST_KM, else null.
export function resolveKey(shapes: readonly CountryShape[], lat: number, lng: number): string | null {
  return keyAtPoint(shapes, lat, lng) ?? nearestKeyWithin(shapes, lat, lng, NEAR_COAST_KM);
}
