"use client";

import { useEffect, useEffectEvent, useRef } from "react";

import {
  createProjectorScene,
  type ProjectorScene,
  type SlideSource,
} from "@/components/slideshow/projector-scene";
import type { SlideTransitionProps } from "@/components/slideshow/transitions";
import { imgUrl } from "@/lib/img-url";
import { pushDurationMs } from "@/lib/projector";
import { dateAndPlaceLine, type SlideshowPhoto } from "@/lib/slideshow";

function source(photo: SlideshowPhoto): SlideSource {
  return { id: photo.id, width: photo.width, height: photo.height, url: imgUrl(photo.id, 1200) };
}

// The 3D slide projector as a persistent stage: one WebGL scene for the whole
// show, created on mount and released on unmount (React Strict Mode mounts twice
// in dev, so the scene builds its own canvas each time). Only this file and
// projector-scene.ts import three.js and they are only reached through
// loadProjectorStage(), so the setup screen never downloads it.
export function ProjectorStage(props: SlideTransitionProps) {
  const { photo, playing } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ProjectorScene | null>(null);

  const reportUnavailable = useEffectEvent(() => props.onUnavailable());
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let scene: ProjectorScene;
    try {
      scene = createProjectorScene(host, { onUnavailable: () => reportUnavailable() });
    } catch {
      // No WebGL: the player falls back to the fade.
      reportUnavailable();
      return;
    }
    sceneRef.current = scene;
    return () => {
      sceneRef.current = null;
      scene.dispose();
    };
  }, []);

  // Load the current photo (cache hit when it was the prefetched next one), put
  // it on screen and report it ready, then warm up the next. Props are read
  // through an effect event so a change of direction or timing alone never
  // restarts the load.
  const present = useEffectEvent(async (scene: ProjectorScene, isStale: () => boolean) => {
    const { nextPhoto, direction, holdMs, onLoaded, onFailed } = props;
    scene.retain(nextPhoto ? [photo.id, nextPhoto.id] : [photo.id]);
    try {
      await scene.load(source(photo));
    } catch {
      if (!isStale()) onFailed(photo.id);
      return;
    }
    if (isStale()) return;
    scene.show(photo.id, direction, { pushMs: pushDurationMs(holdMs / 1000), holdMs });
    onLoaded(photo.id);
    // A failing next photo is skipped by the player's own preloader.
    if (nextPhoto) scene.load(source(nextPhoto)).catch(() => {});
  });
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let stale = false;
    void present(scene, () => stale);
    return () => {
      stale = true;
    };
    // `present` is an effect event: it always reads the latest props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.id]);

  useEffect(() => {
    sceneRef.current?.setPlaying(playing);
  }, [playing]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      role="img"
      aria-label={photo.caption?.trim() || dateAndPlaceLine(photo) || "Photo"}
    />
  );
}
