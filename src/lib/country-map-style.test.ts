import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { countryMapStyle, effectiveProjection, fillStateEntries, HOVER_OPACITY, rotationFor } from "./country-map-style";
import { HOVER_TINT } from "./person-colors";

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

const colors = { sea: "#eee", land: "#ddd", border: "#ccc", visited: "#111111", wishlist: "#222222" };

const paintOf = (style: StyleSpecification, id: string): Record<string, unknown> =>
  (style.layers.find((l) => l.id === id) as { paint: Record<string, unknown> }).paint;

describe("countryMapStyle", () => {
  it("is self-contained", () => {
    const style = countryMapStyle(colors);
    const text = JSON.stringify(style);
    expect(text).not.toMatch(/https?:/);
    expect(style.sprite).toBeUndefined();
    expect(style.glyphs).toBeUndefined();
    expect(Object.keys(style.sources)).toEqual(["countries"]);
  });

  it("draws the hover tint between the fill and the borders", () => {
    expect(countryMapStyle(colors).layers.map((l) => l.id)).toEqual([
      "background",
      "country-fill",
      "country-hover",
      "country-line",
    ]);
  });

  it("takes the fill colour from feature state, land colour by default, with no fade MapLibre would not run", () => {
    const paint = paintOf(countryMapStyle(colors), "country-fill");
    expect(paint["fill-color"]).toEqual(["to-color", ["feature-state", "color"], colors.land]);
    expect(paint).not.toHaveProperty("fill-color-transition");
  });

  it("tints only the hovered country", () => {
    const style = countryMapStyle(colors);
    const hover = style.layers.find((l) => l.id === "country-hover");
    expect(hover).toMatchObject({ type: "fill", source: "countries" });
    const paint = paintOf(style, "country-hover");
    expect(paint["fill-color"]).toBe(HOVER_TINT);
    expect(paint["fill-opacity"]).toEqual(["case", ["boolean", ["feature-state", "hover"], false], HOVER_OPACITY, 0]);
    expect(HOVER_OPACITY).toBeGreaterThan(0);
    expect(HOVER_OPACITY).toBeLessThan(1);
  });

  it("addresses features by catalog key", () => {
    expect(countryMapStyle(colors).sources.countries).toMatchObject({ type: "geojson", promoteId: "key" });
  });
});

describe("fillStateEntries", () => {
  it("resolves theme fills, passes hex through and clears every other key", () => {
    expect(fillStateEntries({ "208": "visited", "578": "#112233" }, ["208", "578", "752"], colors)).toEqual([
      { key: "208", color: colors.visited },
      { key: "578", color: "#112233" },
      { key: "752", color: null },
    ]);
  });
  it("resolves the wishlist and keeps leading zeros in keys", () => {
    expect(fillStateEntries({ "036": "wishlist" }, ["036"], colors)).toEqual([{ key: "036", color: colors.wishlist }]);
  });
});
