// Pure rules for the vacation pins on the globe of memories. No three.js here:
// the scene feeds in the camera distance and canvas height and applies what
// comes out. Keeps pins small and the same size on screen at every zoom.
import { clamp } from "./globe-math";
import { hashCode } from "./scrapbook";

// Vertical field of view of the globe camera, in degrees (see globe-scene.ts).
export const GLOBE_FOV_DEG = 40;
const TAN_HALF_FOV = Math.tan((GLOBE_FOV_DEG * Math.PI) / 360);

// A pin never gets smaller or larger than this on screen, in CSS pixels.
export const PIN_MIN_PX = 18;
export const PIN_MAX_PX = 26;
// Share of the canvas height a pin takes before the band is applied.
const PIN_CANVAS_SHARE = 0.065;
// Depth (camera to pin) never counts as less than this, in globe radii, so a
// camera pushed to the globe's surface cannot produce a zero or huge size.
const MIN_DEPTH = 0.25;

const finite = (x: number, fallback: number): number => (Number.isFinite(x) ? x : fallback);

// Distance from the camera to a pin facing it: the globe has radius 1.
function depthOf(cameraDistance: number): number {
  return Math.max(MIN_DEPTH, finite(cameraDistance, 3.3) - 1);
}

// World size (globe radii) of something that should be `px` tall on screen.
export function pxToWorld(px: number, cameraDistance: number, canvasHeight: number): number {
  const h = Math.max(1, finite(canvasHeight, 320));
  return (px * 2 * depthOf(cameraDistance) * TAN_HALF_FOV) / h;
}

// Inverse of pxToWorld: how many CSS pixels a world size covers.
export function pinPixelHeight(worldHeight: number, cameraDistance: number, canvasHeight: number): number {
  const h = Math.max(1, finite(canvasHeight, 320));
  return (worldHeight * h) / (2 * depthOf(cameraDistance) * TAN_HALF_FOV);
}

// On-screen pin height (CSS px) for a canvas: a little smaller on a short
// phone canvas, capped on a big desktop one.
export function pinPixelTarget(canvasHeight: number): number {
  return clamp(finite(canvasHeight, 320) * PIN_CANVAS_SHARE, PIN_MIN_PX, PIN_MAX_PX);
}

// The size rule: world height of a pin sprite so that it stays the same small
// size on screen whatever the camera distance. Zoom in and the pin shrinks in
// the world, so neighbours separate instead of growing into each other.
export function pinWorldHeight(cameraDistance: number, canvasHeight: number): number {
  return pxToWorld(pinPixelTarget(canvasHeight), cameraDistance, canvasHeight);
}

// Opacity of the soft glow under a pin: weak when the whole globe shows,
// weaker still when zoomed in. `maxDistance` is the zoomed-out limit.
export const GLOW_OPACITY_FAR = 0.42;
export const GLOW_OPACITY_NEAR = 0.1;
export const GLOW_ZOOM_MIN = 1.35;
export function glowOpacity(cameraDistance: number, maxDistance: number): number {
  const span = Math.max(0.01, finite(maxDistance, 3.8) - GLOW_ZOOM_MIN);
  const t = clamp((finite(cameraDistance, maxDistance) - GLOW_ZOOM_MIN) / span, 0, 1);
  return GLOW_OPACITY_NEAR + (GLOW_OPACITY_FAR - GLOW_OPACITY_NEAR) * t;
}

// Multiplier on the flight arcs' tube radius. The arc is world geometry, so
// at a fixed radius it would swell on screen as the camera moves in; this
// shrinks it faster than the depth shrinks, so it also gets thinner on screen.
const ARC_REF_DISTANCE = 3.3;
export function arcWidthFactor(cameraDistance: number): number {
  const ratio = (finite(cameraDistance, ARC_REF_DISTANCE) - 1) / (ARC_REF_DISTANCE - 1);
  return clamp(Math.pow(Math.max(ratio, 0), 1.25), 0.08, 1);
}

// --- which pins face the camera --------------------------------------------

// A point p on the unit globe is in front of the horizon seen from a camera at
// `camera` (globe centre at the origin) exactly when p . camera > 1. The
// margin above 1 hides a pin a little before the limb so it never peeks round.
export const HORIZON_MARGIN = 1.03;

type Vec = { x: number; y: number; z: number };

// True when a pin standing at unit position p shows from `camera`. Pins draw
// without the depth test, so this is the only thing that hides the far side.
export function onNearSide(p: Vec, camera: Vec, margin: number = HORIZON_MARGIN): boolean {
  return p.x * camera.x + p.y * camera.y + p.z * camera.z > margin;
}

// --- fanning out vacations at one spot -------------------------------------

export type PinSite = { id: string; lat: number; lng: number };
export type PinOffset = { dLat: number; dLng: number };

// Vacations closer than this (degrees, about 5 km) count as the same spot.
export const SAME_SPOT_DEG = 0.05;
// Radius of the fan for two vacations, in degrees (about 55 km).
export const FAN_RADIUS_DEG = 0.5;

// Offsets (degrees) that spread vacations sharing a spot on a small circle
// around it, so every pin can be seen and hit. Derived from the ids only (the
// order of the input does not matter): same input, same offsets. A vacation
// alone at its spot gets {0, 0}.
export function fanOffsets(sites: PinSite[]): Map<string, PinOffset> {
  const out = new Map<string, PinOffset>();
  const n = sites.length;
  const parent = sites.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(sites[i].lat - sites[j].lat) <= SAME_SPOT_DEG && Math.abs(sites[i].lng - sites[j].lng) <= SAME_SPOT_DEG) {
        parent[find(i)] = find(j);
      }
    }
  }
  const groups = new Map<number, PinSite[]>();
  sites.forEach((s, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(s);
    else groups.set(root, [s]);
  });
  for (const group of groups.values()) {
    if (group.length < 2) {
      out.set(group[0].id, { dLat: 0, dLng: 0 });
      continue;
    }
    group.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const k = group.length;
    const centreLat = group.reduce((sum, s) => sum + s.lat, 0) / k;
    const stretch = 1 / Math.max(0.2, Math.cos((centreLat * Math.PI) / 180));
    const radius = FAN_RADIUS_DEG * (1 + 0.3 * (k - 2));
    const phase = ((hashCode(group[0].id) % 360) * Math.PI) / 180;
    group.forEach((s, rank) => {
      const a = phase + (rank * 2 * Math.PI) / k;
      out.set(s.id, { dLat: radius * Math.sin(a), dLng: radius * Math.cos(a) * stretch });
    });
  }
  return out;
}
