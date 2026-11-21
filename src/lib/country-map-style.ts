// The countries map style, built in code: a sea-coloured background, one
// GeoJSON source of country shapes (filled in after load by the map
// component), a fill, a hover tint and a line layer. No sprite, no glyphs, no
// tile or style URL, so the map makes no network requests of its own. Fill
// colour is data: the colour string itself is per-feature state keyed by
// catalog key (promoteId), so marking a country repaints one feature and any
// person colour works without a style change. Colours must be rgb or hex
// (MapLibre cannot parse oklch). MapLibre does not animate feature-state
// changes, so the new colour appears at once.
import type { StyleSpecification } from "maplibre-gl";

import { HOVER_TINT, type Hex } from "./person-colors";

// A theme colour, resolved from CSS by the map, or a person colour.
export type ThemeFill = "visited" | "wishlist";
export type MapFill = ThemeFill | Hex;
// Country key to fill.
export type MapFills = Record<string, MapFill>;
export type MapColors = { sea: string; land: string; border: string; visited: string; wishlist: string };

// How strongly the pale hover tint covers the hovered country's own colour.
export const HOVER_OPACITY = 0.35;

export function countryMapStyle(colors: MapColors): StyleSpecification {
  return {
    version: 8,
    sources: {
      countries: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "key",
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": colors.sea } },
      {
        id: "country-fill",
        type: "fill",
        source: "countries",
        paint: {
          // Checked against the installed style spec: to-color falls through
          // a missing or null state to the land colour.
          "fill-color": ["to-color", ["feature-state", "color"], colors.land] as never,
        },
      },
      {
        id: "country-hover",
        type: "fill",
        source: "countries",
        paint: {
          "fill-color": HOVER_TINT,
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], HOVER_OPACITY, 0] as never,
        },
      },
      {
        id: "country-line",
        type: "line",
        source: "countries",
        paint: {
          "line-color": colors.border,
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.4, 4, 1] as never,
        },
      },
    ],
  };
}

type Projection = "mercator" | "globe";

// The flat map never rotates or tilts (a rotated flat world map only
// confuses); the globe may be turned by drag, two fingers or keys.
export function rotationFor(p: Projection): { drag: boolean; touch: boolean; keyboard: boolean } {
  const on = p === "globe";
  return { drag: on, touch: on, keyboard: on };
}

// What the map shows. A globe that failed falls back to flat for this page
// load only: the saved choice is left alone, so it is tried again next time.
export function effectiveProjection(chosen: Projection, globeWorks: boolean): Projection {
  return globeWorks ? chosen : "mercator";
}

// Every key gets a value, so a country whose mark was removed is set back to
// null (the land colour) instead of keeping its old fill. A theme fill
// becomes its resolved colour; a person colour is passed through.
export function fillStateEntries(
  fills: MapFills,
  allKeys: readonly string[],
  theme: Pick<MapColors, "visited" | "wishlist">,
): { key: string; color: string | null }[] {
  return allKeys.map((key) => {
    if (!Object.hasOwn(fills, key)) return { key, color: null };
    const fill = fills[key];
    return { key, color: fill === "visited" || fill === "wishlist" ? theme[fill] : fill };
  });
}
