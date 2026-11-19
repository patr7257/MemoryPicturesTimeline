"use client";

// The only file that touches the map library and the country shapes. It is
// loaded through next/dynamic with ssr: false from CountriesMap, never
// imported directly. Country shapes come from world-atlas (50m) converted in
// the browser; the style is built in code (src/lib/country-map-style.ts), so
// the map requests no tiles, sprites or fonts. Each shape carries its catalog
// key as `properties.key`, promoted to the feature id, and its fill is
// feature state, so marking a country repaints one shape (at once: MapLibre
// does not fade feature-state changes).
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Map, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import type { GeoJSONSource } from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

import { countryByKey, shapeKey } from "@/lib/country-catalog";
import {
  countryMapStyle,
  effectiveProjection,
  fillStateEntries,
  rotationFor,
  type MapColors,
} from "@/lib/country-map-style";
import { cn } from "@/lib/utils";

import type { FillState } from "@/lib/countries";

import type { CountriesMapProps, MapCapture } from "./CountriesMap";
import type { MapProjection } from "./useMapProjection";

type Shapes = { data: GeoJSON.FeatureCollection; keys: string[] };

let shapesCache: Promise<Shapes> | null = null;

// One conversion per page load, shared by every map mounted after it.
function loadShapes(): Promise<Shapes> {
  if (!shapesCache) {
    shapesCache = (async () => {
      const [{ feature }, atlas] = await Promise.all([
        import("topojson-client"),
        import("world-atlas/countries-50m.json"),
      ]);
      const topology = (atlas as { default?: unknown }).default ?? atlas;
      const collection = feature(
        topology as Parameters<typeof feature>[0],
        (topology as { objects: { countries: Parameters<typeof feature>[1] } }).objects.countries,
      ) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, { name: string; key?: string }>;
      const keys = new Set<string>();
      // Nothing is dropped: a shape the catalog cannot mark keeps no key and
      // stays land coloured.
      for (const f of collection.features) {
        const key = shapeKey({ id: f.id, properties: f.properties });
        if (key) {
          f.properties.key = key;
          keys.add(key);
        }
      }
      return { data: collection, keys: [...keys] };
    })().catch((err) => {
      shapesCache = null;
      throw err;
    });
  }
  return shapesCache;
}

const VAR: Record<keyof MapColors, string> = {
  sea: "--country-sea",
  land: "--country-land",
  border: "--border",
  visited: "--country-visited",
  wishlist: "--country-wishlist",
  onlyA: "--country-a",
  onlyB: "--country-b",
  both: "--country-both",
};

// Used only when a variable is unexpectedly empty, so nothing renders clear.
const NEUTRAL: Record<keyof MapColors, string> = {
  sea: "rgb(238,241,242)",
  land: "rgb(232,226,214)",
  border: "rgb(214,206,192)",
  visited: "rgb(180,110,70)",
  wishlist: "rgb(80,150,160)",
  onlyA: "rgb(40,110,120)",
  onlyB: "rgb(160,110,40)",
  both: "rgb(180,110,70)",
};

// The theme is written in oklch, which the map's colour parser does not read.
// Painting one pixel with the browser's own parser and reading it back gives
// plain rgb for any CSS colour.
function readColors(): MapColors {
  const css = getComputedStyle(document.documentElement);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const out = {} as MapColors;
  for (const name of Object.keys(VAR) as (keyof MapColors)[]) {
    const value = css.getPropertyValue(VAR[name]).trim();
    if (!value || !g) {
      out[name] = NEUTRAL[name];
      continue;
    }
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = NEUTRAL[name];
    g.fillStyle = value;
    g.fillRect(0, 0, 1, 1);
    const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
    out[name] = `rgb(${r},${gr},${b})`;
  }
  return out;
}

// A throwaway context, released at once, before the map is mounted.
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

// The globe failed once on this page: keep the flat map and hide the switch
// until the next full load.
let globeBroken = false;

// Zoom at which the flat world exactly spans the frame width (one world is
// 512px wide at zoom 0), so it can never shrink to a stamp in the middle.
const flatMinZoom = (width: number) => Math.log2(Math.max(width, 1) / 512);
// Zoom at which the whole globe fits the frame height, with a little air.
const globeFitZoom = (height: number) => Math.log2((Math.PI * Math.max(height, 1) * 0.84) / 512);

// A capture that never settles (the globe held mid-drag) gives up.
const CAPTURE_TIMEOUT_MS = 4000;

type Setup =
  | { status: "checking" }
  | { status: "no-webgl" }
  | { status: "ready"; colors: MapColors; reducedMotion: boolean; hover: boolean };

export default function CountriesMapInner({
  fills,
  onPick,
  projection,
  onProjectionChange,
  mapRef,
}: Omit<CountriesMapProps, "legend">) {
  const ref = useRef<MapRef>(null);
  const [setup, setSetup] = useState<Setup>({ status: "checking" });
  const [loaded, setLoaded] = useState(false);
  const [keys, setKeys] = useState<string[] | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [globeOk, setGlobeOk] = useState(!globeBroken);
  const [style, setStyle] = useState<ReturnType<typeof countryMapStyle> | null>(null);

  // Browser-only facts, read once after mount.
  useEffect(() => {
    if (!hasWebGL()) {
      setSetup({ status: "no-webgl" });
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = readColors();
    setStyle(countryMapStyle(colors));
    setSetup({
      status: "ready",
      colors,
      reducedMotion,
      // Hover extras only where a real pointer can hover (frontend-ui-patterns PLT-01).
      hover: window.matchMedia("(hover: hover) and (pointer: fine)").matches,
    });
  }, []);

  // The latest on-screen fills, put back after a capture. While a capture
  // runs the fills effect stands aside, so the captured frame holds only the
  // fills the capture was given.
  const fillsRef = useRef(fills);
  const capturing = useRef(false);
  useEffect(() => {
    fillsRef.current = fills;
  }, [fills]);

  // Null until the map and its shapes are in, then the capture used by
  // "Share map". The canvas keeps its drawing buffer (canvasContextAttributes
  // below), and the frame is copied inside the idle event, after the given
  // fills have been drawn.
  useImperativeHandle<MapCapture | null, MapCapture | null>(
    mapRef,
    () => {
      const map = ref.current?.getMap();
      if (!loaded || !keys || !map) return null;
      const apply = (f: Record<string, FillState>) => {
        for (const { key, fill } of fillStateEntries(f, keys)) {
          map.setFeatureState({ source: "countries", id: key }, { fill });
        }
      };
      return {
        async capture(only) {
          capturing.current = true;
          try {
            apply(only);
            return await new Promise<HTMLCanvasElement>((resolve, reject) => {
              // Runs inside a map event: anything it throws would never reach
              // the caller, so every path ends in resolve or reject.
              const done = () => {
                window.clearTimeout(timer);
                try {
                  const src = map.getCanvas();
                  // A hidden or collapsed frame has an empty canvas, which
                  // drawImage refuses.
                  if (src.width === 0 || src.height === 0) throw new Error("The map has no size");
                  const copy = document.createElement("canvas");
                  copy.width = src.width;
                  copy.height = src.height;
                  const g = copy.getContext("2d");
                  if (!g) throw new Error("No 2D canvas");
                  g.drawImage(src, 0, 0);
                  resolve(copy);
                } catch (err) {
                  reject(err);
                }
              };
              const timer = window.setTimeout(() => {
                try {
                  map.off("idle", done);
                } catch {
                  // The map is gone; nothing left to unhook.
                }
                reject(new Error("The map did not settle"));
              }, CAPTURE_TIMEOUT_MS);
              map.once("idle", done);
              map.triggerRepaint();
            });
          } finally {
            capturing.current = false;
            // A map removed mid-capture can throw here; that must never
            // replace the capture's own result or error.
            try {
              apply(fillsRef.current);
            } catch {
              // Nothing to restore on a map that is gone.
            }
          }
        },
      };
    },
    [loaded, keys],
  );

  const effective: MapProjection = effectiveProjection(projection, globeOk);
  const reducedMotion = setup.status === "ready" && setup.reducedMotion;

  const fitCamera = useCallback(
    (p: MapProjection, animate: boolean) => {
      const map = ref.current?.getMap();
      if (!map) return;
      const { width, height } = map.getContainer().getBoundingClientRect();
      const zoom = p === "globe" ? globeFitZoom(height) : flatMinZoom(width);
      map.setMinZoom(p === "globe" ? zoom - 0.5 : zoom);
      const target = { center: [10, p === "globe" ? 30 : 25] as [number, number], zoom, bearing: 0, pitch: 0 };
      // No camera animation with reduced motion.
      if (animate && !reducedMotion) map.easeTo({ ...target, duration: 300 });
      else map.jumpTo(target);
    },
    [reducedMotion],
  );

  // Flat for the rest of this page load. The saved choice is not touched, so
  // the globe is tried again on the next visit.
  const fallBackToFlat = useCallback(() => {
    globeBroken = true;
    setGlobeOk(false);
  }, []);

  // Projection is applied here rather than through the Map prop so a globe
  // the installed renderer cannot draw falls back to flat instead of
  // throwing inside a render.
  const applied = useRef<MapProjection>("mercator");
  useEffect(() => {
    const map = ref.current?.getMap();
    if (!loaded || !map || applied.current === effective) return;
    try {
      map.setProjection({ type: effective });
      applied.current = effective;
      fitCamera(effective, true);
    } catch {
      fallBackToFlat();
    }
  }, [loaded, effective, fitCamera, fallBackToFlat]);

  // Rotation: none on the flat map (two-finger twist and shift+arrow keys
  // included; pinch zoom stays), allowed on the globe. Drag rotation is the
  // dragRotate prop below; the touch and keyboard halves have no prop, so
  // they are switched on the handlers. Bearing and pitch go back to 0 in
  // fitCamera whenever the projection changes.
  useEffect(() => {
    const map = ref.current?.getMap();
    if (!loaded || !map) return;
    const r = rotationFor(effective);
    if (r.touch) map.touchZoomRotate.enableRotation();
    else map.touchZoomRotate.disableRotation();
    if (r.keyboard) map.keyboard.enableRotation();
    else map.keyboard.disableRotation();
  }, [loaded, effective]);

  // Shapes: fetched after the map has its style, then written into the source.
  useEffect(() => {
    if (!loaded) return;
    let live = true;
    loadShapes()
      .then((shapes) => {
        const source = ref.current?.getMap().getSource<GeoJSONSource>("countries");
        if (!live || !source) return;
        source.setData(shapes.data);
        setKeys(shapes.keys);
      })
      .catch(() => {
        // The frame stays sea coloured; the list below still works.
      });
    return () => {
      live = false;
    };
  }, [loaded]);

  // Fills: applied once the shapes are in and on every change after. Every
  // key gets a value so a removed mark goes back to land colour.
  useEffect(() => {
    const map = ref.current?.getMap();
    if (!loaded || !map || !keys || capturing.current) return;
    for (const { key, fill } of fillStateEntries(fills, keys)) {
      map.setFeatureState({ source: "countries", id: key }, { fill });
    }
  }, [loaded, keys, fills]);

  // Keep the world filling the frame when the frame is resized.
  useEffect(() => {
    const map = ref.current?.getMap();
    if (!loaded || !map) return;
    const onResize = () => {
      const { width, height } = map.getContainer().getBoundingClientRect();
      const min = applied.current === "globe" ? globeFitZoom(height) - 0.5 : flatMinZoom(width);
      map.setMinZoom(min);
    };
    map.on("resize", onResize);
    return () => {
      map.off("resize", onResize);
    };
  }, [loaded]);

  if (setup.status === "no-webgl") {
    return (
      <p className="grid size-full place-items-center p-6 text-center text-sm text-muted-foreground">
        The map needs WebGL. The list below works without it.
      </p>
    );
  }
  if (setup.status !== "ready" || !style) return null;

  const keyOf = (e: MapLayerMouseEvent): string | null => {
    const key = e.features?.[0]?.properties?.key;
    return typeof key === "string" ? key : null;
  };
  const hoverName = hovered ? countryByKey(hovered)?.name : undefined;

  return (
    <>
      <div role="img" aria-label="World map of visited countries" className="size-full">
        <Map
          ref={ref}
          mapStyle={style}
          style={{ width: "100%", height: "100%" }}
          initialViewState={{ longitude: 10, latitude: 25, zoom: 0 }}
          renderWorldCopies={false}
          dragRotate={rotationFor(effective).drag}
          pitchWithRotate={false}
          touchPitch={false}
          maxPitch={0}
          attributionControl={false}
          // Keeps the frame readable after compositing, for "Share map".
          canvasContextAttributes={{ preserveDrawingBuffer: true }}
          interactiveLayerIds={["country-fill"]}
          cursor={onPick && hovered ? "pointer" : undefined}
          onLoad={() => {
            fitCamera("mercator", false);
            setLoaded(true);
          }}
          onError={() => {
            // Before the first load this is the renderer failing to start;
            // after switching to the globe it is the globe failing.
            if (!loaded) setSetup({ status: "no-webgl" });
            else if (applied.current === "globe") {
              try {
                ref.current?.getMap().setProjection({ type: "mercator" });
                applied.current = "mercator";
                fitCamera("mercator", false);
              } catch {
                // Nothing more to do; the list still works.
              }
              fallBackToFlat();
            }
          }}
          onMouseMove={setup.hover ? (e) => setHovered(keyOf(e)) : undefined}
          onMouseLeave={setup.hover ? () => setHovered(null) : undefined}
          onClick={
            onPick
              ? (e) => {
                  const key = keyOf(e);
                  if (key) onPick(key);
                }
              : undefined
          }
        />
      </div>

      {hoverName && (
        <p
          aria-hidden
          className="pointer-events-none absolute bottom-3 left-3 rounded-md border bg-card/95 px-2.5 py-1 text-sm shadow-sm"
        >
          {hoverName}
        </p>
      )}

      {globeOk && <ProjectionSwitch value={effective} onChange={onProjectionChange} />}
    </>
  );
}

const OPTIONS: { value: MapProjection; label: string }[] = [
  { value: "mercator", label: "Flat" },
  { value: "globe", label: "Globe" },
];

// A two-option radio group: one tab stop, arrows move and select.
function ProjectionSwitch({ value, onChange }: { value: MapProjection; onChange: (p: MapProjection) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[next].value);
    buttons.current[next]?.focus();
  }
  return (
    <div
      role="radiogroup"
      aria-label="Map view"
      className="absolute top-3 right-3 flex rounded-full border bg-card/95 p-0.5 text-sm shadow-sm"
    >
      {OPTIONS.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "h-8 rounded-full px-3 font-medium transition-colors duration-75 pointer-coarse:h-11 pointer-coarse:px-4",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none",
              checked ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
