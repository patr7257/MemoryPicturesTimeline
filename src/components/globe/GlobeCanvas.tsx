"use client";

// React shell around the three.js globe scene. Loaded on demand by
// GlobeOfMemories (this file transitively imports three.js). Owns the zoom
// buttons because only the scene can act on them.
import { useEffect, useRef } from "react";
import { Minus, Plus } from "lucide-react";

import { createGlobeScene, type GlobeScene } from "./globe-scene";
import { loadLandMask } from "./land";
import type { GlobeTrip } from "./types";
import { prefersReducedMotion } from "./webgl";

export type GlobeCanvasProps = {
  trips: GlobeTrip[];
  selectedId: string | null;
  // A pin to enlarge, e.g. while its chip is hovered.
  highlightId: string | null;
  paused: boolean;
  onSelect: (id: string | null, nearby: number) => void;
  onHover: (id: string | null) => void;
  onInteract: () => void;
  onReady: () => void;
  onUnavailable: () => void;
};

// One button press zooms by this factor.
const ZOOM_STEP = 0.75;

export default function GlobeCanvas(props: GlobeCanvasProps) {
  const { trips, selectedId, highlightId, paused } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GlobeScene | null>(null);
  // Latest props for the long-lived scene callbacks.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  // Content key: the parent may hand over a fresh array with the same trips.
  const tripsKey = trips.map((t) => `${t.id}:${t.lat}:${t.lng}`).join("|");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let scene: GlobeScene | null = null;
    loadLandMask()
      .then((mask) => {
        if (cancelled) return;
        scene = createGlobeScene({
          host,
          mask,
          reducedMotion: prefersReducedMotion(),
          onSelect: (id, nearby) => latest.current.onSelect(id, nearby),
          onHover: (id) => latest.current.onHover(id),
          onInteract: () => latest.current.onInteract(),
        });
        if (!scene) {
          latest.current.onUnavailable();
          return;
        }
        sceneRef.current = scene;
        scene.setTrips(latest.current.trips);
        scene.select(latest.current.selectedId);
        scene.highlight(latest.current.highlightId);
        scene.setPaused(latest.current.paused);
        latest.current.onReady();
      })
      .catch(() => {
        if (!cancelled) latest.current.onUnavailable();
      });
    return () => {
      cancelled = true;
      sceneRef.current = null;
      scene?.dispose();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setTrips(latest.current.trips);
  }, [tripsKey]);

  useEffect(() => {
    sceneRef.current?.select(selectedId);
  }, [selectedId]);

  useEffect(() => {
    sceneRef.current?.highlight(highlightId);
  }, [highlightId]);

  useEffect(() => {
    sceneRef.current?.setPaused(paused);
  }, [paused]);

  const zoomBtn =
    "grid size-11 place-items-center rounded-full border border-border bg-card/90 text-foreground shadow-sm hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none md:size-9";

  return (
    <>
      <div ref={hostRef} className="absolute inset-0" aria-hidden />
      <div className="absolute bottom-2.5 left-2.5 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          className={zoomBtn}
          onClick={() => sceneRef.current?.zoomBy(ZOOM_STEP)}
          aria-label="Zoom in on the globe"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          className={zoomBtn}
          onClick={() => sceneRef.current?.zoomBy(1 / ZOOM_STEP)}
          aria-label="Zoom out on the globe"
        >
          <Minus className="size-4" />
        </button>
      </div>
    </>
  );
}
