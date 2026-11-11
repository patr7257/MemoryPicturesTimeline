"use client";

import type { ComponentType } from "react";
import { AnimatePresence, motion } from "motion/react";

import { imgUrl } from "@/lib/img-url";
import { driftFor, type SlideshowPhoto } from "@/lib/slideshow";

// The seam between the player and what is on screen. The player renders exactly
// ONE stage component for the whole show and keeps it mounted across slides,
// handing it the current photo; the stage owns how the previous photo leaves and
// the new one arrives and what it keeps in memory. Two stages exist: the fade
// below (always available) and the 3D projector (ProjectorStage, loaded on demand
// through loadProjectorStage so three.js is never in the initial bundle).
export type SlideTransitionProps = {
  photo: SlideshowPhoto;
  // The next photo that will play (null at the end): a stage may prefetch it.
  nextPhoto: SlideshowPhoto | null;
  // +1 when moving forward, -1 when moving back (for directional transitions).
  direction: 1 | -1;
  // The whole slot of a photo in ms (seconds per photo): a transition into the
  // photo happens inside it, and the slow drift spans it.
  holdMs: number;
  // False while the show is paused: slow motion should freeze.
  playing: boolean;
  reducedMotion: boolean;
  // The photo's pixels are ready: the player starts its timer here.
  onLoaded: (photoId: string) => void;
  // The photo could not load: the player skips it.
  onFailed: (photoId: string) => void;
  // The stage cannot work on this device or any more (no WebGL, lost context,
  // shader error): the player switches to the fade and carries on.
  onUnavailable: () => void;
};

// The projector stage, fetched on demand. Rejects when the chunk cannot load.
export function loadProjectorStage(): Promise<ComponentType<SlideTransitionProps>> {
  return import("@/components/slideshow/ProjectorStage").then((m) => m.ProjectorStage);
}

const FADE_S = 0.9;
const FADE_REDUCED_S = 0.3;

// Baseline: cross-fade plus a slow Ken Burns drift, blurred backdrop behind
// the uncropped photo. Reduced motion: plain short fade, no drift.
export function FadeTransition({
  photo,
  holdMs,
  playing,
  reducedMotion,
  onLoaded,
  onFailed,
}: SlideTransitionProps) {
  const drift = driftFor(photo.id);
  const seconds = reducedMotion ? FADE_REDUCED_S : FADE_S;
  return (
    <AnimatePresence>
      <motion.div
        key={photo.id}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: seconds, ease: "easeInOut" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgUrl(photo.id, 400)}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full scale-125 object-cover opacity-40 blur-3xl"
          draggable={false}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgUrl(photo.id, 1200)}
          alt={photo.caption ?? ""}
          className="absolute inset-0 size-full object-contain will-change-transform"
          style={
            reducedMotion
              ? undefined
              : ({
                  "--dx": `${drift.x}%`,
                  "--dy": `${drift.y}%`,
                  animation: `slideshow-drift ${holdMs + seconds * 2000}ms linear forwards`,
                  animationPlayState: playing ? "running" : "paused",
                } as React.CSSProperties)
          }
          draggable={false}
          onLoad={() => onLoaded(photo.id)}
          onError={() => onFailed(photo.id)}
        />
      </motion.div>
    </AnimatePresence>
  );
}

// Keyframes the drift uses. Rendered once by the player.
export const DRIFT_KEYFRAMES = `@keyframes slideshow-drift { from { transform: scale(1) translate(0, 0); } to { transform: scale(1.08) translate(var(--dx), var(--dy)); } }`;
