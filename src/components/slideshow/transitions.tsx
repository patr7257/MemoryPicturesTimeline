"use client";

import type { ComponentType } from "react";
import { AnimatePresence, motion } from "motion/react";

import { imgUrl } from "@/lib/img-url";
import { driftFor, type SlideshowPhoto } from "@/lib/slideshow";

// The seam for slide transitions. The player renders exactly one
// SlideTransition and hands it the current photo; the component owns how the
// previous photo leaves and the new one arrives. A later wave (for example a 3D
// slide projector) adds a component with this same props shape and registers it
// in TRANSITIONS, without touching the player.
export type SlideTransitionProps = {
  photo: SlideshowPhoto;
  // +1 when moving forward, -1 when moving back (for directional transitions).
  direction: 1 | -1;
  // How long the photo is held, in ms: the Ken Burns drift spans this.
  holdMs: number;
  // False while the show is paused: slow motion should freeze.
  playing: boolean;
  reducedMotion: boolean;
  // The photo's pixels are ready: the player starts its timer here.
  onLoaded: (photoId: string) => void;
  // The photo could not load: the player skips it.
  onFailed: (photoId: string) => void;
};

export type SlideTransitionId = "fade";

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

export const TRANSITIONS: Record<SlideTransitionId, ComponentType<SlideTransitionProps>> = {
  fade: FadeTransition,
};

// Keyframes the drift uses. Rendered once by the player.
export const DRIFT_KEYFRAMES = `@keyframes slideshow-drift { from { transform: scale(1) translate(0, 0); } to { transform: scale(1.08) translate(var(--dx), var(--dy)); } }`;
