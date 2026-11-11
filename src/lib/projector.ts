// Pure maths for the slide projector (no three.js, no browser APIs), so it is
// unit tested in projector.test.ts. The scene in
// components/slideshow/projector-scene.ts feeds these numbers to shaders.

import { hashId, prng } from "./slideshow";

export type Rgb = { r: number; g: number; b: number };

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function lerp(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

// GLSL smoothstep.
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ---- Timing ---------------------------------------------------------------

export const PUSH_MIN_MS = 500;
export const PUSH_MAX_MS = 1050;
export const PUSH_SHARE = 0.25;

// How long the film-strip push plus focus pull takes. It happens at the start
// of a photo's slot, INSIDE the chosen seconds per photo (the player's timer
// starts when the photo is ready, the push runs during its first part), so it
// is a quarter of the slot, between 0.5 and 1.05 s: at the 2 s minimum the slide
// still holds for 1.5 s.
export function pushDurationMs(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return PUSH_MIN_MS;
  return Math.round(clamp(seconds * 1000 * PUSH_SHARE, PUSH_MIN_MS, PUSH_MAX_MS));
}

export type SlidePhase = { pushing: boolean; p: number };

// Where a slide is `sinceMs` after it arrived: still pushing in (p in 0..1) or
// settled (p = 1).
export function slidePhase(sinceMs: number, pushMs: number): SlidePhase {
  if (!(pushMs > 0) || sinceMs >= pushMs) return { pushing: false, p: 1 };
  return { pushing: true, p: clamp(sinceMs / pushMs, 0, 1) };
}

export type PushLook = {
  // 0..1: how far the film strip has travelled (0 = old slide, 1 = new slide).
  shift: number;
  // Blur radius in screen uv units; 0 when sharp.
  blur: number;
  // Brightness of the lamp while the strip moves (dark gap between frames).
  dim: number;
  // A tiny vertical gate jitter in screen uv units as the new frame lands.
  jitter: number;
};

// The look of the push at progress p (0..1 of the push duration): the strip
// moves during the first 46 %, then the new slide settles with a little
// mechanical jitter and a focus pull (blur that sharpens to exactly 0 at p = 1).
export function pushLook(p: number): PushLook {
  const t = clamp(p, 0, 1);
  const m = clamp(t / 0.46, 0, 1);
  const shift = easeInOut(m) + 0.012 * Math.sin(Math.PI * clamp((t - 0.4) / 0.16, 0, 1));
  const jitter = t > 0.44 && t < 1 ? 0.006 * Math.exp(-(t - 0.44) * 13) * Math.sin((t - 0.44) * 70) : 0;
  const pull = t > 0.42 ? 0.62 + 0.38 * Math.cos((t - 0.42) * 17) : 1;
  const blur = t >= 1 ? 0 : 0.03 * smoothstep(0.06, 0.42, t) * Math.pow(1 - smoothstep(0.42, 1, t), 1.5) * pull;
  const dim = t >= 1 ? 1 : 1 - 0.6 * Math.sin(Math.PI * m);
  return { shift: t >= 1 ? 1 : shift, blur, dim, jitter };
}

// ---- Screen and camera ------------------------------------------------------

export type Rect = { x: number; y: number; w: number; h: number };

// Where a photo sits inside the screen, as fractions of the screen (uv space):
// contained, centred, never stretched. A degenerate aspect fills the screen.
export function letterbox(photoAspect: number, screenAspect: number): Rect {
  if (!(photoAspect > 0) || !(screenAspect > 0)) return { x: 0, y: 0, w: 1, h: 1 };
  if (photoAspect >= screenAspect) {
    const h = screenAspect / photoAspect;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = photoAspect / screenAspect;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

// The wall screen follows the stage shape (a tall one on a portrait phone) so
// the photo can fill it, within sane limits.
export function screenAspectFor(stageAspect: number): number {
  if (!(stageAspect > 0)) return 1.5;
  return clamp(stageAspect * 0.92, 0.62, 1.6);
}

export type Framing = {
  // Small stage (phone): the screen fills almost all of it, camera front-on,
  // beam kept faint. Otherwise the room is visible around the screen.
  compact: boolean;
  screenAspect: number;
  // Share of the frustum the screen's extent may use.
  fill: number;
  // Sideways camera offset per unit of distance (0 = front-on).
  yaw: number;
  // How far below the screen centre the camera looks (room floor visible).
  lookDown: number;
  beamK: number;
};

export const COMPACT_BELOW_PX = 600;

export function framing(stageW: number, stageH: number): Framing {
  const w = stageW > 0 ? stageW : 1;
  const h = stageH > 0 ? stageH : 1;
  const screenAspect = screenAspectFor(w / h);
  if (Math.min(w, h) < COMPACT_BELOW_PX) {
    return { compact: true, screenAspect, fill: 0.96, yaw: 0, lookDown: 0, beamK: 0.45 };
  }
  return { compact: false, screenAspect, fill: 0.92, yaw: 0.1, lookDown: 0.3, beamK: 0.75 };
}

// Camera distance so a screen of screenW x screenH, centred `offsetY` above the
// look-at point, uses at most `fill` of the view in both directions.
export function cameraDistance(o: {
  screenW: number;
  screenH: number;
  offsetY: number;
  aspect: number;
  fovDeg: number;
  fill: number;
}): number {
  const tan = Math.tan((o.fovDeg * Math.PI) / 360);
  const needV = o.screenH / 2 + Math.abs(o.offsetY);
  const needH = o.screenW / 2;
  const f = clamp(o.fill, 0.2, 1);
  return Math.max(needV / (tan * f), needH / (tan * Math.max(0.1, o.aspect) * f));
}

// ---- Drift, colour, dust ----------------------------------------------------

export type KenBurns = {
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
};

// Slow drift in screen uv units (pan) and zoom, seeded by the photo id so a
// photo always drifts the same way. Zoom stays under 8 % so the photo stays whole.
export function kenBurnsFor(id: string): KenBurns {
  const r = prng(hashId(id));
  const zoomIn = r() > 0.5;
  const pan = () => (r() - 0.5) * 0.024;
  const a = { x: pan(), y: pan(), z: zoomIn ? 1.02 : 1.08 };
  const b = { x: pan(), y: pan(), z: zoomIn ? 1.08 : 1.02 };
  return { from: a, to: b };
}

export function kenBurnsAt(kb: KenBurns, u: number): { x: number; y: number; z: number } {
  const t = clamp(u, 0, 1);
  return {
    x: lerp(kb.from.x, kb.to.x, t),
    y: lerp(kb.from.y, kb.to.y, t),
    z: lerp(kb.from.z, kb.to.z, t),
  };
}

// Average colour (0..1) of RGBA bytes, ignoring alpha. Empty input is mid grey.
export function averageColor(rgba: ArrayLike<number>): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i + 2 < rgba.length; i += 4) {
    r += rgba[i];
    g += rgba[i + 1];
    b += rgba[i + 2];
    n++;
  }
  if (n === 0) return { r: 0.5, g: 0.5, b: 0.5 };
  return { r: r / n / 255, g: g / n / 255, b: b / n / 255 };
}

function unit(v: number, fallback: number): number {
  return Number.isFinite(v) ? clamp(v, 0, 1) : fallback;
}

// A photo's average colour, made safe to tint light with: 0..1 per channel.
export function safeColor(c: Rgb): Rgb {
  return { r: unit(c.r, 0.5), g: unit(c.g, 0.5), b: unit(c.b, 0.5) };
}

// Beam colour from the slide's average: pulled toward warm projector white so a
// dark or saturated photo never makes a black or neon beam.
export function beamTint(avg: Rgb): Rgb {
  const c = safeColor(avg);
  return {
    r: clamp(0.55 + 0.45 * c.r, 0, 1),
    g: clamp(0.55 + 0.45 * c.g, 0, 1),
    b: clamp(0.5 + 0.45 * c.b, 0, 1),
  };
}

// Per-mote random seeds, 4 numbers each (position along the beam, x and y in
// -1..1, size/speed): deterministic, so the dust is the same every run.
export function dustSeeds(count: number, seed: number): Float32Array {
  const out = new Float32Array(Math.max(0, count) * 4);
  const r = prng(seed);
  for (let i = 0; i < out.length; i++) out[i] = i % 4 === 1 || i % 4 === 2 ? r() * 2 - 1 : r();
  return out;
}
