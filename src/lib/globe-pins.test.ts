import { describe, expect, it } from "vitest";

import {
  PIN_MAX_PX,
  PIN_MIN_PX,
  arcWidthFactor,
  fanOffsets,
  glowOpacity,
  pinPixelHeight,
  pinPixelTarget,
  pinWorldHeight,
  pxToWorld,
  HORIZON_MARGIN,
  onNearSide,
} from "./globe-pins";
import { ZOOM_MIN_DIST } from "./globe-math";

const DISTANCES = [ZOOM_MIN_DIST, 1.5, 2, 2.6, 3.3, 3.77, 5];
const CANVAS_HEIGHTS = [180, 320, 440, 520, 900];

describe("pin size rule", () => {
  it("keeps the on-screen height inside one narrow band across the zoom range", () => {
    for (const h of CANVAS_HEIGHTS) {
      const px = DISTANCES.map((d) => pinPixelHeight(pinWorldHeight(d, h), d, h));
      expect(Math.max(...px) - Math.min(...px)).toBeLessThan(0.001);
    }
  });

  it("never goes below the minimum or above the maximum on screen", () => {
    for (const h of [0, 50, 180, 320, 520, 2000, 100000]) {
      for (const d of DISTANCES) {
        const px = pinPixelHeight(pinWorldHeight(d, h), d, h);
        expect(px).toBeGreaterThanOrEqual(PIN_MIN_PX - 1e-9);
        expect(px).toBeLessThanOrEqual(PIN_MAX_PX + 1e-9);
      }
    }
  });

  it("makes the pin smaller in the world the closer the camera is", () => {
    const sizes = DISTANCES.map((d) => pinWorldHeight(d, 320));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
  });

  it("stays finite for bad input", () => {
    for (const d of [Number.NaN, 0, -3, Number.POSITIVE_INFINITY]) {
      expect(Number.isFinite(pinWorldHeight(d, 320))).toBe(true);
      expect(pinWorldHeight(d, 320)).toBeGreaterThan(0);
    }
    expect(Number.isFinite(pinWorldHeight(3, Number.NaN))).toBe(true);
  });

  it("converts pixels to world units with the camera depth", () => {
    expect(pxToWorld(10, 3.3, 320)).toBeCloseTo(2 * pxToWorld(5, 3.3, 320), 12);
    expect(pxToWorld(10, 4.3, 320)).toBeGreaterThan(pxToWorld(10, 3.3, 320));
  });

  it("uses a larger pin on a taller canvas but never beyond the band", () => {
    expect(pinPixelTarget(520)).toBeGreaterThanOrEqual(pinPixelTarget(320));
    expect(pinPixelTarget(100000)).toBe(PIN_MAX_PX);
    expect(pinPixelTarget(1)).toBe(PIN_MIN_PX);
  });
});

describe("glow and arcs fade with zoom", () => {
  const far = 3.77;
  it("glow is weak and weaker still when zoomed in", () => {
    expect(glowOpacity(far, far)).toBeLessThanOrEqual(0.5);
    expect(glowOpacity(ZOOM_MIN_DIST, far)).toBeLessThan(glowOpacity(far, far));
    expect(glowOpacity(ZOOM_MIN_DIST, far)).toBeGreaterThan(0);
    let prev = 0;
    for (const d of DISTANCES) {
      const o = glowOpacity(d, far);
      expect(o).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
  });

  it("arcs get thinner as the camera moves in, within fixed bounds", () => {
    expect(arcWidthFactor(10)).toBe(1);
    let prev = 0;
    for (const d of DISTANCES) {
      const f = arcWidthFactor(d);
      expect(f).toBeGreaterThanOrEqual(0.08);
      expect(f).toBeLessThanOrEqual(1);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(arcWidthFactor(ZOOM_MIN_DIST)).toBeLessThan(0.2);
  });

  it("arcs also get thinner on screen when zoomed in", () => {
    const px = (d: number) => arcWidthFactor(d) / (d - 1);
    expect(px(ZOOM_MIN_DIST)).toBeLessThan(px(3.3));
  });
});

describe("fanOffsets", () => {
  const resort = [
    { id: "b-trip", lat: 46.5, lng: 8.1 },
    { id: "a-trip", lat: 46.5, lng: 8.1 },
    { id: "c-trip", lat: 46.5001, lng: 8.1002 },
  ];

  it("gives a lone vacation no offset", () => {
    const out = fanOffsets([{ id: "x", lat: 10, lng: 20 }, ...resort]);
    expect(out.get("x")).toEqual({ dLat: 0, dLng: 0 });
  });

  it("gives distinct vacations at one spot distinct offsets", () => {
    const out = fanOffsets(resort);
    const keys = resort.map((r) => {
      const o = out.get(r.id)!;
      return `${o.dLat.toFixed(6)},${o.dLng.toFixed(6)}`;
    });
    expect(new Set(keys).size).toBe(3);
    for (const r of resort) {
      const o = out.get(r.id)!;
      expect(Math.hypot(o.dLat, o.dLng)).toBeGreaterThan(0.1);
    }
  });

  it("is stable: same input same offsets, whatever the input order", () => {
    const a = fanOffsets(resort);
    const b = fanOffsets([...resort].reverse());
    const c = fanOffsets(resort);
    for (const r of resort) {
      expect(b.get(r.id)).toEqual(a.get(r.id));
      expect(c.get(r.id)).toEqual(a.get(r.id));
    }
  });

  it("keeps the fan small and centred on the spot", () => {
    const out = fanOffsets(resort);
    let sLat = 0;
    for (const r of resort) {
      const o = out.get(r.id)!;
      expect(Math.abs(o.dLat)).toBeLessThan(1.5);
      expect(Math.abs(o.dLng)).toBeLessThan(2);
      sLat += o.dLat;
    }
    expect(Math.abs(sLat)).toBeLessThan(0.2);
  });

  it("does not fan vacations that are far apart", () => {
    const out = fanOffsets([
      { id: "p", lat: 55.68, lng: 12.57 },
      { id: "q", lat: 55.9, lng: 12.57 },
    ]);
    expect(out.get("p")).toEqual({ dLat: 0, dLng: 0 });
    expect(out.get("q")).toEqual({ dLat: 0, dLng: 0 });
  });

  it("handles an empty list", () => {
    expect(fanOffsets([]).size).toBe(0);
  });
});

describe("onNearSide", () => {
  const camera = { x: 0, y: 0, z: 3 };

  it("shows a point facing the camera", () => {
    expect(onNearSide({ x: 0, y: 0, z: 1 }, camera)).toBe(true);
  });

  it("hides the antipode", () => {
    expect(onNearSide({ x: 0, y: 0, z: -1 }, camera)).toBe(false);
  });

  it("hides a point exactly on the limb", () => {
    // For a unit sphere the limb seen from distance d is where p.z = 1 / d.
    const z = 1 / 3;
    const r = Math.sqrt(1 - z * z);
    expect(onNearSide({ x: r, y: 0, z }, camera)).toBe(false);
    expect(onNearSide({ x: 0, y: -r, z }, camera)).toBe(false);
  });

  it("uses the default margin as the threshold on p dot camera", () => {
    const inside = (HORIZON_MARGIN + 0.001) / 3;
    const outside = (HORIZON_MARGIN - 0.001) / 3;
    expect(onNearSide({ x: 0, y: Math.sqrt(1 - inside * inside), z: inside }, camera)).toBe(true);
    expect(onNearSide({ x: 0, y: Math.sqrt(1 - outside * outside), z: outside }, camera)).toBe(false);
  });

  it("takes a custom margin", () => {
    expect(onNearSide({ x: 0, y: 0, z: 1 }, camera, 2.9)).toBe(true);
    expect(onNearSide({ x: 0, y: 0, z: 1 }, camera, 3.1)).toBe(false);
  });
});
