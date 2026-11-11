"use client";

// Full-window flight to a vacation. Loaded on demand (it imports three.js);
// FlightProvider owns when it mounts and what happens at the white-out.
import { useEffect, useRef, useState } from "react";
import { Plane, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createFlightScene, type FlightScene } from "./flight-scene";
import { loadLandMask } from "./land";
import type { FlightTarget } from "./types";

export type FlightOverlayProps = {
  target: FlightTarget;
  // The view is white: navigate (or keep the white held) and remove the overlay.
  onNavigate: () => void;
  // The flight could not start (no WebGL, texture failed): navigate plainly.
  onFail: () => void;
};

const TAP_SKIP_AFTER_MS = 500;
const HARD_TIMEOUT_MS = 9000;

export default function FlightOverlay({ target, onNavigate, onFail }: FlightOverlayProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const sceneRef = useRef<FlightScene | null>(null);
  const mountedAt = useRef(0);
  const callbacks = useRef({ onNavigate, onFail });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    callbacks.current = { onNavigate, onFail };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    mountedAt.current = performance.now();
    let cancelled = false;
    let scene: FlightScene | null = null;
    loadLandMask()
      .then((mask) => {
        if (cancelled) return;
        scene = createFlightScene({
          host,
          mask,
          target,
          flash: flashRef.current,
          onReady: () => setReady(true),
          onNavigate: () => callbacks.current.onNavigate(),
        });
        if (!scene) {
          callbacks.current.onFail();
          return;
        }
        sceneRef.current = scene;
      })
      .catch(() => {
        if (!cancelled) callbacks.current.onFail();
      });
    // Never stuck: whatever happens, navigate after the hard timeout.
    const hard = window.setTimeout(() => callbacks.current.onNavigate(), HARD_TIMEOUT_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(hard);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [target]);

  const skip = () => {
    if (sceneRef.current) sceneRef.current.skip();
    else callbacks.current.onNavigate();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (ready) skipRef.current?.focus();
  }, [ready]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Flying to ${target.title}`}
      onPointerDown={() => {
        if (performance.now() - mountedAt.current > TAP_SKIP_AFTER_MS) skip();
      }}
      className={`fixed inset-0 z-[200] touch-none bg-[#d9e6ea] transition-opacity duration-300 ${
        ready ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div ref={hostRef} className="absolute inset-0" aria-hidden />
      <div ref={flashRef} className="pointer-events-none absolute inset-0 bg-white opacity-0" aria-hidden />
      <p className="font-hand pointer-events-none absolute inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-card/85 px-5 py-1.5 text-2xl text-foreground shadow-[0_2px_10px_var(--paper-shadow)]">
        <Plane className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="truncate">Flying to {target.title}</span>
      </p>
      <Button
        ref={skipRef}
        type="button"
        variant="secondary"
        onClick={(e) => {
          e.stopPropagation();
          skip();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 h-11 px-4 md:h-9"
      >
        <X />
        Skip
      </Button>
    </div>
  );
}
