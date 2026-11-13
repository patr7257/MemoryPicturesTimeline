import { describe, expect, it } from "vitest";

import {
  HOME,
  angularDistance,
  arcHeight,
  clusterIndices,
  flightEligible,
  flightDuration,
  initialView,
  latLngToVec,
  lngDelta,
  wheelZoomFactor,
  zoomDistance,
  ZOOM_MIN_DIST,
  slerp,
  vecToLatLng,
  viewDistanceFor,
  type Vec3,
} from "./globe-math";

const close = (a: Vec3, b: Vec3, eps = 1e-9) => {
  expect(a[0]).toBeCloseTo(b[0], 8);
  expect(a[1]).toBeCloseTo(b[1], 8);
  expect(a[2]).toBeCloseTo(b[2], 8);
  void eps;
};
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

describe("latLngToVec", () => {
  it("puts 0,0 on +X", () => close(latLngToVec(0, 0), [1, 0, 0]));
  it("puts the poles on the Y axis", () => {
    close(latLngToVec(90, 0), [0, 1, 0]);
    close(latLngToVec(-90, 123), [0, -1, 0]);
  });
  it("puts longitude +90 on -Z and -90 on +Z", () => {
    close(latLngToVec(0, 90), [0, 0, -1]);
    close(latLngToVec(0, -90), [0, 0, 1]);
  });
  it("treats the antimeridian as one place", () => {
    close(latLngToVec(10, 180), latLngToVec(10, -180));
    close(latLngToVec(0, 180), [-1, 0, 0]);
  });
  it("returns unit vectors, including for the home point", () => {
    const h = latLngToVec(HOME.lat, HOME.lng);
    expect(len(h)).toBeCloseTo(1, 10);
    expect(h[1]).toBeGreaterThan(0.8); // far north
  });
  it("round-trips through vecToLatLng", () => {
    const p = vecToLatLng(latLngToVec(HOME.lat, HOME.lng));
    expect(p.lat).toBeCloseTo(HOME.lat, 8);
    expect(p.lng).toBeCloseTo(HOME.lng, 8);
    expect(vecToLatLng(latLngToVec(-33.9, -151.2)).lng).toBeCloseTo(-151.2, 8);
  });
});

describe("angularDistance", () => {
  it("is 0 for the same point, PI/2 for a quarter turn, PI for antipodes", () => {
    const a = latLngToVec(10, 20);
    expect(angularDistance(a, a)).toBe(0);
    expect(angularDistance(latLngToVec(0, 0), latLngToVec(0, 90))).toBeCloseTo(Math.PI / 2, 10);
    expect(angularDistance(latLngToVec(0, 0), latLngToVec(0, 180))).toBeCloseTo(Math.PI, 10);
  });
  it("matches a known distance (Copenhagen to Krakow is about 0.17 rad)", () => {
    const d = angularDistance(latLngToVec(HOME.lat, HOME.lng), latLngToVec(50.06, 19.94));
    expect(d).toBeGreaterThan(0.12);
    expect(d).toBeLessThan(0.2);
  });
});

describe("slerp", () => {
  const a = latLngToVec(HOME.lat, HOME.lng);
  const b = latLngToVec(40.71, -74);
  it("returns the endpoints exactly", () => {
    expect(slerp(a, b, 0)).toEqual(a);
    expect(slerp(a, b, 1)).toEqual(b);
  });
  it("keeps every point on the sphere and the midpoint equidistant", () => {
    for (const t of [0.1, 0.25, 0.5, 0.9]) expect(len(slerp(a, b, t))).toBeCloseTo(1, 10);
    const m = slerp(a, b, 0.5);
    expect(angularDistance(a, m)).toBeCloseTo(angularDistance(m, b), 10);
    expect(angularDistance(a, m)).toBeCloseTo(angularDistance(a, b) / 2, 10);
  });
  it("does not produce NaN for identical points", () => {
    const m = slerp(a, a, 0.5);
    expect(m.every(Number.isFinite)).toBe(true);
    close(m, a);
  });
  it("does not produce NaN for antipodal points and stays equidistant", () => {
    const anti: Vec3 = [-a[0], -a[1], -a[2]];
    const m = slerp(a, anti, 0.5);
    expect(m.every(Number.isFinite)).toBe(true);
    expect(len(m)).toBeCloseTo(1, 10);
    expect(angularDistance(a, m)).toBeCloseTo(Math.PI / 2, 6);
  });
  it("handles antipodes on the Y axis", () => {
    const m = slerp([0, 1, 0], [0, -1, 0], 0.5);
    expect(m.every(Number.isFinite)).toBe(true);
    expect(len(m)).toBeCloseTo(1, 10);
  });
});

describe("arcHeight and flightDuration", () => {
  const angles = [0, 0.02, 0.1, 0.5, 1, 2, Math.PI];
  it("are monotonic non-decreasing", () => {
    for (let i = 1; i < angles.length; i++) {
      expect(arcHeight(angles[i])).toBeGreaterThanOrEqual(arcHeight(angles[i - 1]));
      expect(flightDuration(angles[i])).toBeGreaterThanOrEqual(flightDuration(angles[i - 1]));
    }
  });
  it("is longer and higher for far than for near", () => {
    expect(flightDuration(2)).toBeGreaterThan(flightDuration(0.05));
    expect(arcHeight(2)).toBeGreaterThan(arcHeight(0.05));
  });
  it("is clamped to sane bounds", () => {
    expect(flightDuration(0)).toBeGreaterThanOrEqual(3);
    expect(flightDuration(100)).toBeLessThanOrEqual(5);
    expect(arcHeight(0)).toBeGreaterThan(0);
    expect(arcHeight(100)).toBeLessThanOrEqual(0.4);
  });
  it("keeps a short hop between 3 and 4 seconds", () => {
    expect(flightDuration(0.17)).toBeGreaterThanOrEqual(3);
    expect(flightDuration(0.17)).toBeLessThanOrEqual(4);
  });
});

describe("initialView", () => {
  it("falls back to home with no pins", () => {
    expect(initialView([])).toEqual(HOME);
  });
  it("sits between home and a single pin, nearer to neither extreme", () => {
    const v = initialView([{ lat: 40.71, lng: -74 }]);
    const dHome = angularDistance(latLngToVec(v.lat, v.lng), latLngToVec(HOME.lat, HOME.lng));
    const dPin = angularDistance(latLngToVec(v.lat, v.lng), latLngToVec(40.71, -74));
    expect(dHome).toBeGreaterThan(0);
    expect(dPin).toBeGreaterThan(0);
    expect(v.lng).toBeLessThan(HOME.lng);
    expect(v.lng).toBeGreaterThan(-74);
  });
  it("stays near home when most pins are European", () => {
    const pins = [
      { lat: 50.06, lng: 19.94 },
      { lat: 45.6, lng: 10.65 },
      { lat: 38.72, lng: -9.14 },
      { lat: -33.9, lng: 151.2 },
    ];
    const v = initialView(pins);
    expect(angularDistance(latLngToVec(v.lat, v.lng), latLngToVec(HOME.lat, HOME.lng))).toBeLessThan(1.2);
  });
  it("never returns NaN when the directions cancel out", () => {
    const anti = vecToLatLng(latLngToVec(-HOME.lat, HOME.lng + 180));
    const v = initialView([anti, anti]);
    expect(Number.isFinite(v.lat) && Number.isFinite(v.lng)).toBe(true);
  });
});

describe("clusterIndices", () => {
  it("groups close pins and keeps far ones apart", () => {
    const pins = [
      { lat: 50, lng: 10 },
      { lat: 50.01, lng: 10.01 },
      { lat: -30, lng: 100 },
    ];
    const groups = clusterIndices(pins, 0.02);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.includes(0))).toEqual([0, 1]);
  });
  it("links across the antimeridian", () => {
    const groups = clusterIndices(
      [
        { lat: 0, lng: 179.99 },
        { lat: 0, lng: -179.99 },
      ],
      0.01,
    );
    expect(groups).toHaveLength(1);
  });
});

describe("lngDelta", () => {
  it("takes the short way round", () => {
    expect(lngDelta(170, -170)).toBe(20);
    expect(lngDelta(-170, 170)).toBe(-20);
    expect(lngDelta(10, 10)).toBe(0);
  });
});

describe("viewDistanceFor", () => {
  it("grows with the spread, stays finite and never below 1.7", () => {
    expect(viewDistanceFor(0)).toBeGreaterThanOrEqual(1.7);
    expect(viewDistanceFor(1)).toBeGreaterThan(viewDistanceFor(0.3));
    expect(Number.isFinite(viewDistanceFor(Math.PI))).toBe(true);
  });
});

describe("flightEligible", () => {
  it("accepts a real destination", () => expect(flightEligible(40.71, -74)).toBe(true));
  it("rejects missing, non-finite and out of range coordinates", () => {
    expect(flightEligible(null, 10)).toBe(false);
    expect(flightEligible(10, undefined)).toBe(false);
    expect(flightEligible(Number.NaN, 10)).toBe(false);
    expect(flightEligible(95, 10)).toBe(false);
    expect(flightEligible(10, 200)).toBe(false);
  });
  it("rejects the home point itself but accepts a nearby town", () => {
    expect(flightEligible(HOME.lat, HOME.lng)).toBe(false);
    expect(flightEligible(HOME.lat + 0.5, HOME.lng)).toBe(true);
  });
});

describe("zoomDistance", () => {
  it("scales the distance and stays inside the limits", () => {
    expect(zoomDistance(3, 0.5, 4)).toBeCloseTo(1.5, 10);
    expect(zoomDistance(1.5, 0.5, 4)).toBe(ZOOM_MIN_DIST);
    expect(zoomDistance(3.5, 2, 4)).toBe(4);
  });
  it("ignores a broken factor", () => {
    expect(zoomDistance(2, Number.NaN, 4)).toBe(2);
    expect(zoomDistance(2, 0, 4)).toBe(2);
    expect(zoomDistance(2, -1, 4)).toBe(2);
  });
  it("never lets the far limit fall below the near one", () => {
    expect(zoomDistance(2, 1, 1)).toBe(ZOOM_MIN_DIST);
  });
});

describe("wheelZoomFactor", () => {
  it("zooms in on scroll up, out on scroll down, about 1.35x per notch", () => {
    expect(wheelZoomFactor(-100)).toBeLessThan(1);
    expect(wheelZoomFactor(100)).toBeCloseTo(1.3499, 3);
    expect(wheelZoomFactor(0)).toBe(1);
  });
  it("caps a huge delta", () => {
    expect(wheelZoomFactor(10_000)).toBe(wheelZoomFactor(200));
  });
});
