"use client";

// React shell around the three.js globe scene. Loaded on demand by
// GlobeOfMemories (this file transitively imports three.js).
import { useEffect, useRef } from "react";

import { createGlobeScene, type GlobeScene } from "./globe-scene";
import { loadLandMask } from "./land";
import type { GlobeTrip } from "./types";
import { prefersReducedMotion } from "./webgl";

export type GlobeCanvasProps = {
  trips: GlobeTrip[];
  selectedId: string | null;
  paused: boolean;
  labelRef: React.RefObject<HTMLElement | null>;
  onSelect: (id: string | null, nearby: number) => void;
  onInteract: () => void;
  onReady: () => void;
  onUnavailable: () => void;
};

export default function GlobeCanvas(props: GlobeCanvasProps) {
  const { trips, selectedId, paused, labelRef } = props;
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
          getLabel: () => labelRef.current,
          onSelect: (id, nearby) => latest.current.onSelect(id, nearby),
          onInteract: () => latest.current.onInteract(),
        });
        if (!scene) {
          latest.current.onUnavailable();
          return;
        }
        sceneRef.current = scene;
        scene.setTrips(latest.current.trips);
        scene.select(latest.current.selectedId);
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
  }, [labelRef]);

  useEffect(() => {
    sceneRef.current?.setTrips(latest.current.trips);
  }, [tripsKey]);

  useEffect(() => {
    sceneRef.current?.select(selectedId);
  }, [selectedId]);

  useEffect(() => {
    sceneRef.current?.setPaused(paused);
  }, [paused]);

  return <div ref={hostRef} className="absolute inset-0" aria-hidden />;
}
