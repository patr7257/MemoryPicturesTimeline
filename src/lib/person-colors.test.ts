import { describe, expect, it } from "vitest";

import {
  colorsForMissing,
  firstFreeColorKey,
  HOVER_TINT,
  isPaletteKey,
  PALETTE,
  resolvePersonColors,
  SHARED_COLOR,
} from "./person-colors";

// Reference colours converted from src/app/globals.css (OKLCH to sRGB hex,
// gamut-clipped): --country-land = --secondary oklch(0.92 0.026 82) and
// --country-wishlist oklch(0.62 0.07 198).
const LAND = "#ede3d2";
const WISHLIST = "#4e9395";

function oklab(hex: string): [number, number, number] {
  const lin = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(0), lin(1), lin(2)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const dist = (a: string, b: string) => {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

describe("PALETTE", () => {
  it("has enough unique hex entries", () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(12);
    expect(new Set(PALETTE.map((p) => p.key)).size).toBe(PALETTE.length);
    expect(PALETTE.every((p) => /^#[0-9a-f]{6}$/i.test(p.hex))).toBe(true);
  });

  it("keeps every pair apart in OKLab", () => {
    const all = [...PALETTE.map((p) => p.hex), SHARED_COLOR, HOVER_TINT, WISHLIST];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(dist(all[i], all[j]), `${all[i]} vs ${all[j]}`).toBeGreaterThanOrEqual(0.08);
  });

  it("keeps fills readable against the land", () => {
    for (const hex of [...PALETTE.map((p) => p.hex), SHARED_COLOR])
      expect(dist(hex, LAND), hex).toBeGreaterThanOrEqual(0.12);
  });

  it("recognises its keys only", () => {
    expect(isPaletteKey(PALETTE[0].key)).toBe(true);
    expect(isPaletteKey("nope")).toBe(false);
    expect(isPaletteKey(null)).toBe(false);
  });
});

describe("assignment", () => {
  it("finds the first free key in palette order", () => {
    expect(firstFreeColorKey([PALETTE[0].key, null])).toBe(PALETTE[1].key);
    expect(firstFreeColorKey(PALETTE.map((p) => p.key))).toBeNull();
  });

  it("gives missing people the next free keys in id order", () => {
    expect(
      colorsForMissing([
        { id: "b", color: null },
        { id: "a", color: PALETTE[0].key },
        { id: "c", color: "nope" },
      ]),
    ).toEqual([
      { personId: "b", color: PALETTE[1].key },
      { personId: "c", color: PALETTE[2].key },
    ]);
  });

  it("stops when the palette runs out", () => {
    const people = [
      ...PALETTE.map((p, i) => ({ id: `p${i}`, color: p.key })),
      { id: "z", color: null },
    ];
    expect(colorsForMissing(people)).toEqual([]);
  });

  it("resolves stored keys and fills the rest stably", () => {
    const people = [
      { id: "b", color: null },
      { id: "a", color: PALETTE[3].key },
    ];
    expect(resolvePersonColors(people)).toEqual({ a: PALETTE[3].hex, b: PALETTE[0].hex });
    expect(resolvePersonColors(people)).toEqual(resolvePersonColors([...people].reverse()));
  });

  it("cycles the palette when it runs out", () => {
    const people = Array.from({ length: PALETTE.length + 2 }, (_, i) => ({
      id: String(i).padStart(3, "0"),
      color: null,
    }));
    const out = resolvePersonColors(people);
    expect(out["000"]).toBe(PALETTE[0].hex);
    expect(out[String(PALETTE.length).padStart(3, "0")]).toBe(PALETTE[0].hex);
    expect(Object.keys(out)).toHaveLength(people.length);
  });
});
