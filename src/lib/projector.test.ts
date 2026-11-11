import { describe, expect, it } from "vitest";

import {
  PUSH_MAX_MS,
  PUSH_MIN_MS,
  averageColor,
  beamTint,
  cameraDistance,
  dustSeeds,
  easeInOut,
  framing,
  kenBurnsAt,
  kenBurnsFor,
  letterbox,
  pushDurationMs,
  pushLook,
  safeColor,
  screenAspectFor,
  slidePhase,
} from "./projector";

describe("pushDurationMs", () => {
  it("is a quarter of the slot, between 0.5 and 1.05 s", () => {
    expect(pushDurationMs(3)).toBe(750);
    expect(pushDurationMs(4)).toBe(1000);
    expect(pushDurationMs(5)).toBe(PUSH_MAX_MS);
    expect(pushDurationMs(30)).toBe(PUSH_MAX_MS);
  });
  it("leaves a real hold at the 2 second minimum", () => {
    expect(pushDurationMs(2)).toBe(PUSH_MIN_MS);
    expect(2000 - pushDurationMs(2)).toBeGreaterThanOrEqual(1500);
  });
  it("never exceeds the slot and survives bad input", () => {
    for (let s = 2; s <= 30; s++) expect(pushDurationMs(s)).toBeLessThan(s * 1000 * 0.5);
    expect(pushDurationMs(Number.NaN)).toBe(PUSH_MIN_MS);
    expect(pushDurationMs(-3)).toBe(PUSH_MIN_MS);
  });
});

describe("slidePhase", () => {
  it("pushes first, then settles", () => {
    expect(slidePhase(0, 1000)).toEqual({ pushing: true, p: 0 });
    expect(slidePhase(250, 1000)).toEqual({ pushing: true, p: 0.25 });
    expect(slidePhase(1000, 1000)).toEqual({ pushing: false, p: 1 });
    expect(slidePhase(5000, 1000)).toEqual({ pushing: false, p: 1 });
  });
  it("clamps negative time and treats a zero push as settled", () => {
    expect(slidePhase(-50, 1000).p).toBe(0);
    expect(slidePhase(0, 0)).toEqual({ pushing: false, p: 1 });
  });
});

describe("pushLook", () => {
  it("starts on the old slide, sharp and lit", () => {
    expect(pushLook(0)).toEqual({ shift: 0, blur: 0, dim: 1, jitter: 0 });
  });
  it("ends on the new slide, sharp, lit and still", () => {
    expect(pushLook(1)).toEqual({ shift: 1, blur: 0, dim: 1, jitter: 0 });
    expect(pushLook(7)).toEqual({ shift: 1, blur: 0, dim: 1, jitter: 0 });
  });
  it("moves the strip monotonically up to the landing", () => {
    let last = -1;
    for (let p = 0; p <= 0.4; p += 0.02) {
      const s = pushLook(p).shift;
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
    expect(pushLook(0.46).shift).toBeCloseTo(1, 1);
  });
  it("pulls focus: blurs mid-way, then sharpens, only inside the push", () => {
    expect(pushLook(0.3).blur).toBeGreaterThan(0.005);
    expect(pushLook(0.9).blur).toBeLessThan(pushLook(0.5).blur);
    expect(pushLook(0.999).blur).toBeLessThan(0.0004);
    for (let p = 0; p <= 1; p += 0.01) expect(pushLook(p).blur).toBeLessThanOrEqual(0.03);
  });
  it("dims the lamp while the strip moves", () => {
    expect(pushLook(0.23).dim).toBeCloseTo(0.4, 1);
  });
});

describe("letterbox", () => {
  it("fits a wide photo into a taller screen with bars above and below", () => {
    const r = letterbox(2, 1);
    expect(r).toEqual({ x: 0, y: 0.25, w: 1, h: 0.5 });
  });
  it("fits a tall photo into a wide screen with bars left and right", () => {
    const r = letterbox(0.5, 1.5);
    expect(r.h).toBe(1);
    expect(r.w).toBeCloseTo(1 / 3, 10);
    expect(r.x).toBeCloseTo(1 / 3, 10);
  });
  it("keeps the photo's aspect ratio exactly (never stretched)", () => {
    for (const [photo, screen] of [
      [1.5, 1.6],
      [0.75, 0.62],
      [1.78, 1.6],
      [1, 1],
      [3, 0.7],
    ]) {
      const r = letterbox(photo, screen);
      expect((r.w * screen) / r.h).toBeCloseTo(photo, 10);
      expect(Math.max(r.w, r.h)).toBeCloseTo(1, 10);
    }
  });
  it("fills the screen for a degenerate aspect", () => {
    expect(letterbox(0, 1.5)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(letterbox(Number.NaN, 1.5)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe("screen and framing", () => {
  it("shapes the screen after the stage within limits", () => {
    expect(screenAspectFor(0.46)).toBe(0.62);
    expect(screenAspectFor(1)).toBeCloseTo(0.92, 10);
    expect(screenAspectFor(3)).toBe(1.6);
    expect(screenAspectFor(0)).toBe(1.5);
  });
  it("fills a phone stage and shows the room on a big one", () => {
    const phone = framing(390, 800);
    const landscapePhone = framing(800, 390);
    const desktop = framing(1600, 900);
    expect(phone.compact && landscapePhone.compact).toBe(true);
    expect(desktop.compact).toBe(false);
    expect(phone.fill).toBeGreaterThan(desktop.fill);
    expect(phone.yaw).toBe(0);
    expect(desktop.yaw).toBeGreaterThan(0);
    expect(phone.beamK).toBeLessThan(desktop.beamK);
  });
  it("keeps the screen inside the view at the requested fill", () => {
    const aspect = 16 / 9;
    const o = { screenW: 4.16, screenH: 2.6, offsetY: 0.35, aspect, fovDeg: 40, fill: 0.86 };
    const d = cameraDistance(o);
    const tan = Math.tan((40 * Math.PI) / 360);
    expect((o.screenH / 2 + o.offsetY) / (d * tan)).toBeLessThanOrEqual(0.86 + 1e-9);
    expect(o.screenW / 2 / (d * tan * aspect)).toBeLessThanOrEqual(0.86 + 1e-9);
    // A portrait stage is limited by width, so the camera backs off.
    const tall = cameraDistance({ ...o, aspect: 0.46, screenW: 1.6, offsetY: 0, fill: 0.96 });
    expect(1.6 / 2 / (tall * tan * 0.46)).toBeCloseTo(0.96, 5);
  });
});

describe("kenBurns", () => {
  it("is deterministic per id and differs between ids", () => {
    expect(kenBurnsFor("abc")).toEqual(kenBurnsFor("abc"));
    expect(kenBurnsFor("abc")).not.toEqual(kenBurnsFor("abd"));
  });
  it("stays gentle: zoom 1.02 to 1.08, pan under 1.3 % of the screen", () => {
    for (const id of ["a", "b", "c", "photo-1", "photo-2", "0f8fad5b-d9cb-469f-a165-70867728950e"]) {
      const kb = kenBurnsFor(id);
      for (const p of [kb.from, kb.to]) {
        expect(p.z).toBeGreaterThanOrEqual(1.02);
        expect(p.z).toBeLessThanOrEqual(1.08);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(0.0121);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(0.0121);
      }
      expect(kb.from.z).not.toBe(kb.to.z);
    }
  });
  it("interpolates and clamps", () => {
    const kb = kenBurnsFor("x");
    expect(kenBurnsAt(kb, 0)).toEqual(kb.from);
    expect(kenBurnsAt(kb, 1)).toEqual(kb.to);
    expect(kenBurnsAt(kb, 9)).toEqual(kb.to);
    expect(kenBurnsAt(kb, -1)).toEqual(kb.from);
    expect(kenBurnsAt(kb, 0.5).z).toBeCloseTo((kb.from.z + kb.to.z) / 2, 10);
  });
});

describe("colour", () => {
  it("averages RGBA bytes and ignores alpha", () => {
    const c = averageColor([255, 0, 0, 255, 0, 0, 255, 0]);
    expect(c.r).toBeCloseTo(0.5, 10);
    expect(c.g).toBe(0);
    expect(c.b).toBeCloseTo(0.5, 10);
  });
  it("answers mid grey for no pixels", () => {
    expect(averageColor([])).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
  });
  it("clamps unsafe colours", () => {
    expect(safeColor({ r: -1, g: 3, b: Number.NaN })).toEqual({ r: 0, g: 1, b: 0.5 });
  });
  it("keeps the beam warm and visible for black and white photos", () => {
    expect(beamTint({ r: 0, g: 0, b: 0 })).toEqual({ r: 0.55, g: 0.55, b: 0.5 });
    const white = beamTint({ r: 1, g: 1, b: 1 });
    expect(white.r).toBe(1);
    expect(white.g).toBe(1);
    expect(white.b).toBeCloseTo(0.95, 10);
    const odd = beamTint({ r: 9, g: Number.NaN, b: -4 });
    for (const v of [odd.r, odd.g, odd.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("dustSeeds", () => {
  it("is deterministic and in range", () => {
    const a = dustSeeds(50, 99);
    expect(a.length).toBe(200);
    expect(Array.from(a)).toEqual(Array.from(dustSeeds(50, 99)));
    expect(Array.from(a)).not.toEqual(Array.from(dustSeeds(50, 100)));
    for (let i = 0; i < a.length; i++) {
      if (i % 4 === 1 || i % 4 === 2) {
        expect(a[i]).toBeGreaterThanOrEqual(-1);
        expect(a[i]).toBeLessThanOrEqual(1);
      } else {
        expect(a[i]).toBeGreaterThanOrEqual(0);
        expect(a[i]).toBeLessThanOrEqual(1);
      }
    }
    expect(dustSeeds(0, 1).length).toBe(0);
  });
});

describe("easeInOut", () => {
  it("runs 0 to 1 symmetrically", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
  });
});
