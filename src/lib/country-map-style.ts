// The countries map style, built in code: a sea-coloured background, one
// GeoJSON source of country shapes (filled in after load by the map
// component) and a fill plus a line layer. No sprite, no glyphs, no tile or
// style URL, so the map makes no network requests of its own. Fill colour
// comes from per-feature state keyed by catalog key (promoteId), so marking a
// country repaints one feature and the colour can fade.
import type { StyleSpecification } from "maplibre-gl";

import type { FillState } from "./countries";

export type MapColors = { sea: string; land: string; border: string } & Record<FillState, string>;

const FILL_STATES: readonly FillState[] = ["visited", "wishlist", "onlyA", "onlyB", "both"];

// A state change is an entrance of the new colour: 250ms sits inside the
// entrance window and under the interactive cap (frontend-ui-patterns MOT-01,
// MOT-07). Reduced motion passes 0.
export const FILL_TRANSITION_MS = 250;

export function countryMapStyle(
  colors: MapColors,
  options: { transitionMs?: number } = {},
): StyleSpecification {
  const duration = options.transitionMs ?? FILL_TRANSITION_MS;
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
          "fill-color-transition": { duration, delay: 0 },
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

// Every key gets a value, so a country whose mark was removed is set back to
// "none" (the land colour) instead of keeping its old fill.
export function fillStateEntries(
  fills: Record<string, FillState>,
  allKeys: readonly string[],
): { key: string; fill: FillState | "none" }[] {
  return allKeys.map((key) => ({ key, fill: Object.hasOwn(fills, key) ? fills[key] : "none" }));
}
