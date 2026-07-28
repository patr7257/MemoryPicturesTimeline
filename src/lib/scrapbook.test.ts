import { describe, expect, it } from "vitest";

import { offsetFor, rotationFor } from "./scrapbook";

describe("scrapbook determinism", () => {
  it("returns the same rotation for the same id", () => {
    const id = "0b6f2ab8-6d5f-4ceb-a2f5-9f4f3f0b6a01";
    expect(rotationFor(id)).toBe(rotationFor(id));
  });

  it("stays within the requested range", () => {
    for (let i = 0; i < 200; i++) {
      const r = rotationFor(`photo-${i}`, 4);
      expect(r).toBeGreaterThanOrEqual(-4);
      expect(r).toBeLessThanOrEqual(4);
    }
  });

  it("varies across ids and axes", () => {
    const values = new Set<number>();
    for (let i = 0; i < 50; i++) values.add(rotationFor(`p${i}`));
    expect(values.size).toBeGreaterThan(3);
    expect(offsetFor("abc", "x")).not.toBe(offsetFor("abc", "y"));
  });
});
