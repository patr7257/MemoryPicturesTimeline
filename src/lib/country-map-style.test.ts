import { describe, expect, it } from "vitest";
import { countryMapStyle, effectiveProjection, fillStateEntries, rotationFor } from "./country-map-style";

describe("rotationFor", () => {
  it("allows no rotation of any kind on the flat map", () => {
    expect(rotationFor("mercator")).toEqual({ drag: false, touch: false, keyboard: false });
  });
  it("lets the globe be turned", () => {
    expect(rotationFor("globe")).toEqual({ drag: true, touch: true, keyboard: true });
  });
});

describe("effectiveProjection", () => {
  it("shows the chosen projection while the globe works", () => {
    expect(effectiveProjection("globe", true)).toBe("globe");
    expect(effectiveProjection("mercator", true)).toBe("mercator");
  });
  it("shows the flat map after the globe failed, whatever was chosen", () => {
    expect(effectiveProjection("globe", false)).toBe("mercator");
  });
});

const colors = { sea: "#eee", land: "#ddd", border: "#ccc", visited: "#1", wishlist: "#2", onlyA: "#3", onlyB: "#4", both: "#5" };

describe("countryMapStyle", () => {
  it("is self-contained", () => {
    const style = countryMapStyle(colors);
    const text = JSON.stringify(style);
    expect(text).not.toMatch(/https?:/);
    expect(style.sprite).toBeUndefined();
    expect(style.glyphs).toBeUndefined();
    expect(style.layers.map((l) => l.id)).toEqual(["background", "country-fill", "country-line"]);
    expect(Object.keys(style.sources)).toEqual(["countries"]);
  });

  it("fills by feature state, land colour by default, fading unless motion is reduced", () => {
    const fill = countryMapStyle(colors).layers[1];
    expect(fill.type).toBe("fill");
    const paint = (fill as { paint: Record<string, unknown> }).paint;
    const expr = paint["fill-color"] as unknown[];
    expect(expr[0]).toBe("case");
    expect(expr.at(-1)).toBe("#ddd");
    expect(expr).toContainEqual(["==", ["feature-state", "fill"], "both"]);
    expect(paint["fill-color-transition"]).toEqual({ duration: 250, delay: 0 });

    const still = countryMapStyle(colors, { transitionMs: 0 }).layers[1] as { paint: Record<string, unknown> };
    expect(still.paint["fill-color-transition"]).toEqual({ duration: 0, delay: 0 });
  });

  it("addresses features by catalog key", () => {
    expect(countryMapStyle(colors).sources.countries).toMatchObject({ type: "geojson", promoteId: "key" });
  });
});

describe("fillStateEntries", () => {
  it("covers every key so a removed mark is cleared", () => {
    expect(fillStateEntries({ "208": "visited" }, ["208", "578"])).toEqual([
      { key: "208", fill: "visited" },
      { key: "578", fill: "none" },
    ]);
  });
});
