// The countries map style, built in code: a sea-coloured background, one
// GeoJSON source of country shapes (filled in after load by the map
// component) and a fill plus a line layer. No sprite, no glyphs, no tile or
// style URL, so the map makes no network requests of its own. Fill colour
// comes from per-feature state keyed by catalog key (promoteId), so marking a
// country repaints one feature. MapLibre does not animate feature-state
// changes, so the new colour appears at once.
import type { StyleSpecification } from "maplibre-gl";

import type { FillState } from "./countries";

export type MapColors = { sea: string; land: string; border: string } & Record<FillState, string>;

const FILL_STATES: readonly FillState[] = ["visited", "wishlist", "onlyA", "onlyB", "both"];

export function countryMapStyle(colors: MapColors): StyleSpecification {
  const cases: unknown[] = [];
  for (const s of FILL_STATES) cases.push(["==", ["feature-state", "fill"], s], colors[s]);
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
          "fill-color": ["case", ...cases, colors.land] as never,
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
// "none" (the land colour) instead of keeping its old fill.
export function fillStateEntries(
  fills: Record<string, FillState>,
  allKeys: readonly string[],
): { key: string; fill: FillState | "none" }[] {
  return allKeys.map((key) => ({ key, fill: Object.hasOwn(fills, key) ? fills[key] : "none" }));
}
