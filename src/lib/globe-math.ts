// Pure globe math shared by the globe of memories and the flight overlay.
// No three.js import on purpose: this runs (and is tested) in plain Node.
//
// Convention: unit sphere, +Y is the north pole, longitude 0 / latitude 0 is
// +X, longitude +90 is -Z. This is exactly the layout of three's
// SphereGeometry UVs when u = (lng + 180) / 360 and v = (lat + 90) / 180, so
// an equirectangular texture drawn as (lng, lat) lines up with the mesh.

export type Vec3 = [number, number, number];
export type LatLng = { lat: number; lng: number };

// Copenhagen area. The single place the home point lives: the owner will
// confirm this value.
export const HOME: LatLng = { lat: 55.68, lng: 12.57 };

const DEG = Math.PI / 180;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function latLngToVec(lat: number, lng: number): Vec3 {
  const ph = (lng + 180) * DEG;
  const th = (90 - lat) * DEG;
  const s = Math.sin(th);
  return [-Math.cos(ph) * s, Math.cos(th), Math.sin(ph) * s];
}

export function vecToLatLng(v: Vec3): LatLng {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  const y = clamp(v[1] / len, -1, 1);
  const lat = Math.asin(y) / DEG;
  // Atan2 of the horizontal part; at the poles longitude is arbitrary (0).
  const lng = Math.hypot(v[0], v[2]) < 1e-9 ? 0 : Math.atan2(-v[2], v[0]) / DEG;
  return { lat, lng };
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-12) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

// Angle in radians between two unit vectors, in [0, PI]. Uses atan2 of the
// cross and dot products: accurate for tiny and near-antipodal angles where
// acos(dot) loses precision.
export function angularDistance(a: Vec3, b: Vec3): number {
  const cx = a[1] * b[2] - a[2] * b[1];
  const cy = a[2] * b[0] - a[0] * b[2];
  const cz = a[0] * b[1] - a[1] * b[0];
  return Math.atan2(Math.hypot(cx, cy, cz), dot(a, b));
}

// Great-circle interpolation, t in [0, 1]. Endpoints are returned exactly.
// Identical points return the point; antipodal points (no unique great
// circle) go through a deterministic perpendicular, never NaN.
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  if (t <= 0) return [a[0], a[1], a[2]];
  if (t >= 1) return [b[0], b[1], b[2]];
  const ang = angularDistance(a, b);
  if (ang < 1e-9) return [a[0], a[1], a[2]];
  if (Math.PI - ang < 1e-6) {
    // Pick any axis not parallel to a, rotate a around it by t * PI.
    const axisSrc: Vec3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const k = normalize([
      axisSrc[1] * a[2] - axisSrc[2] * a[1],
      axisSrc[2] * a[0] - axisSrc[0] * a[2],
      axisSrc[0] * a[1] - axisSrc[1] * a[0],
    ]);
    const c = Math.cos(t * Math.PI);
    const s = Math.sin(t * Math.PI);
    // a is perpendicular to k, so Rodrigues reduces to a*cos + (k x a)*sin.
    const kxa: Vec3 = [
      k[1] * a[2] - k[2] * a[1],
      k[2] * a[0] - k[0] * a[2],
      k[0] * a[1] - k[1] * a[0],
    ];
    return normalize([a[0] * c + kxa[0] * s, a[1] * c + kxa[1] * s, a[2] * c + kxa[2] * s]);
  }
  const s = Math.sin(ang);
  const k1 = Math.sin((1 - t) * ang) / s;
  const k2 = Math.sin(t * ang) / s;
  return normalize([a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2]);
}

// How high (in globe radii) the flight arc peaks above the surface for a leg
// spanning `angle` radians. Monotonic, clamped: a short hop stays low, a
// long haul never leaves the frame.
export function arcHeight(angle: number): number {
  return clamp(0.03 + 0.16 * angle, 0.03, 0.4);
}

// Flight length in seconds: 3 s for a short hop, about 4 s across
// Europe-to-America distances, never beyond 4.8 s.
export function flightDuration(angle: number): number {
  return clamp(3 + 0.9 * angle, 3, 4.8);
}

// Where the globe should look first: the mean direction of home plus every
// pin, so home and the bulk of the pins share the view. Falls back to home
// when there is nothing to average or the directions cancel out.
export function initialView(pins: LatLng[], home: LatLng = HOME): LatLng {
  if (pins.length === 0) return { ...home };
  const sum: Vec3 = [0, 0, 0];
  // Home counts as much as the whole travelled-to set so a single far pin
  // cannot drag the view into the Pacific.
  const hv = latLngToVec(home.lat, home.lng);
  const hw = Math.max(1, pins.length / 2);
  sum[0] += hv[0] * hw;
  sum[1] += hv[1] * hw;
  sum[2] += hv[2] * hw;
  for (const p of pins) {
    const v = latLngToVec(p.lat, p.lng);
    sum[0] += v[0];
    sum[1] += v[1];
    sum[2] += v[2];
  }
  if (Math.hypot(sum[0], sum[1], sum[2]) < 1e-6) return { ...home };
  return vecToLatLng(sum);
}

// Groups pins closer than `maxAngle` radians (single linkage, stable order),
// so the UI can tell that several vacations sit on top of each other.
export function clusterIndices(pins: LatLng[], maxAngle: number): number[][] {
  const vecs = pins.map((p) => latLngToVec(p.lat, p.lng));
  const groupOf: number[] = pins.map((_, i) => i);
  const find = (i: number): number => (groupOf[i] === i ? i : (groupOf[i] = find(groupOf[i])));
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      if (angularDistance(vecs[i], vecs[j]) <= maxAngle) groupOf[find(j)] = find(i);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < pins.length; i++) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(i);
    groups.set(root, list);
  }
  return Array.from(groups.values());
}

// Shortest signed longitude difference in degrees, in (-180, 180].
export function lngDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

// Camera distance (globe radii) that shows every point within `maxAngle`
// radians of the view centre with some margin: the horizon of a camera at
// distance d sits acos(1/d) from the centre. Never closer than 1.7 and
// finite however wide the spread.
export function viewDistanceFor(maxAngle: number): number {
  const half = clamp(maxAngle * 1.35 + 0.3, 0.45, 1.2);
  return Math.max(1.7, 1 / Math.cos(half));
}

// A flight is only worth playing for real coordinates that are not on top of
// home (a hop of a few kilometres has no arc to draw).
export function flightEligible(lat: unknown, lng: unknown, home: LatLng = HOME): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return angularDistance(latLngToVec(lat, lng), latLngToVec(home.lat, home.lng)) >= 0.004;
}

// Closest the camera may get to the centre (globe radius 1): close enough to
// tell neighbouring cities apart, far enough that the surface never clips.
export const ZOOM_MIN_DIST = 1.35;

// New camera distance after zooming by `factor` (below 1 is closer), kept
// between ZOOM_MIN_DIST and `maxDist`.
export function zoomDistance(current: number, factor: number, maxDist: number): number {
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  return clamp(current * f, ZOOM_MIN_DIST, Math.max(ZOOM_MIN_DIST, maxDist));
}

// Wheel delta to a zoom factor. Ctrl + wheel and trackpad pinches both arrive
// as wheel events; one mouse notch (about 100) is a 1.35x step.
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(clamp(deltaY, -200, 200) * 0.003);
}
