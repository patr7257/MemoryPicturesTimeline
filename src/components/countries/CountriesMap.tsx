"use client";

// The world map on the countries page. The map library and the country
// shapes live only in CountriesMapInner, which loads in the browser on its own
// chunk, so none of it is in the page's first-load bundle. This wrapper owns
// the frame (so the page does not jump while the chunk loads) and the legend,
// and knows nothing about modes: the view passes fills and legend entries.
// The flat map covers the whole frame; the paper behind it shows only around
// the globe, so the sea-coloured sphere keeps a visible edge.
import dynamic from "next/dynamic";

import type { FillState } from "@/lib/countries";
import { cn } from "@/lib/utils";

import type { MapProjection } from "./useMapProjection";

const CountriesMapInner = dynamic(() => import("./CountriesMapInner"), {
  ssr: false,
  loading: () => (
    <div role="status" className="grid size-full place-items-center text-sm text-muted-foreground">
      Loading the map
    </div>
  ),
});

export type MapLegendEntry = { fill: FillState; label: string };

// Draws the map once with the given fills, copies that frame to a plain 2D
// canvas, then puts the on-screen fills back (also when it fails). Used by
// "Share map" so the image never shows fills it was not given.
export type MapCapture = { capture(fills: Record<string, FillState>): Promise<HTMLCanvasElement> };

export type CountriesMapProps = {
  fills: Record<string, FillState>;
  // Omitted means read-only: no pointer cursor and taps do nothing.
  onPick?: (countryKey: string) => void;
  projection: MapProjection;
  onProjectionChange: (p: MapProjection) => void;
  mapRef?: React.Ref<MapCapture | null>;
  // State is never shown by colour alone: each fill in use gets a named swatch.
  legend?: MapLegendEntry[];
};

const SWATCH: Record<FillState, string> = {
  visited: "bg-country-visited",
  wishlist: "bg-country-wishlist",
  onlyA: "bg-country-a",
  onlyB: "bg-country-b",
  both: "bg-country-both",
};

export function CountriesMap({ legend, ...props }: CountriesMapProps) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative aspect-[3/2] max-h-[32rem] w-full overflow-hidden rounded-lg border bg-card shadow-[0_1px_2px_oklch(0.4_0.03_60/0.08),0_8px_24px_-12px_oklch(0.4_0.03_60/0.18)] sm:aspect-[2/1]">
        <CountriesMapInner {...props} />
      </div>
      {legend && legend.length > 0 && (
        <figcaption>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {legend.map((e) => (
              <li key={e.fill} className="flex items-center gap-1.5">
                <span aria-hidden className={cn("size-3 rounded-[3px] ring-1 ring-black/10", SWATCH[e.fill])} />
                {e.label}
              </li>
            ))}
          </ul>
        </figcaption>
      )}
    </figure>
  );
}
