import { describe, expect, it } from "vitest";

import { PROJECTION_KEY, readSavedProjection, saveProjection } from "./useMapProjection";

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    store: () => ({
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
    }),
  };
}

const throwing = () => {
  throw new Error("SecurityError");
};

describe("projection preference", () => {
  it("reads a saved choice and ignores anything else", () => {
    expect(readSavedProjection(memoryStore({ [PROJECTION_KEY]: "globe" }).store)).toBe("globe");
    expect(readSavedProjection(memoryStore({ [PROJECTION_KEY]: "mercator" }).store)).toBe("mercator");
    expect(readSavedProjection(memoryStore({ [PROJECTION_KEY]: "albers" }).store)).toBeNull();
    expect(readSavedProjection(memoryStore().store)).toBeNull();
  });

  it("saves under the countries-projection key", () => {
    const m = memoryStore();
    saveProjection(m.store, "globe");
    expect(m.data).toEqual({ "countries-projection": "globe" });
  });

  it("never throws when storage is blocked", () => {
    expect(readSavedProjection(throwing)).toBeNull();
    expect(() => saveProjection(throwing, "globe")).not.toThrow();
  });
});
