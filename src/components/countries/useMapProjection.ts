"use client";

import { useEffect, useState } from "react";

export type MapProjection = "mercator" | "globe";

export const PROJECTION_KEY = "countries-projection";

type Store = Pick<Storage, "getItem" | "setItem">;

// Private windows and blocked storage throw on access; both helpers swallow
// that so the map still works, just without remembering the choice.
export function readSavedProjection(store: () => Store): MapProjection | null {
  try {
    const saved = store().getItem(PROJECTION_KEY);
    return saved === "globe" || saved === "mercator" ? saved : null;
  } catch {
    return null;
  }
}

export function saveProjection(store: () => Store, p: MapProjection): void {
  try {
    store().setItem(PROJECTION_KEY, p);
  } catch {
    // Not remembered this time; the choice still applies now.
  }
}

const local = () => window.localStorage;

// The flat or globe choice, remembered per browser. Read after mount (never
// during render, so server and client agree on the first paint).
export function useMapProjection(): {
  projection: MapProjection;
  onProjectionChange: (p: MapProjection) => void;
} {
  const [projection, setProjection] = useState<MapProjection>("mercator");

  useEffect(() => {
    const saved = readSavedProjection(local);
    if (saved) setProjection(saved);
  }, []);

  function onProjectionChange(p: MapProjection) {
    setProjection(p);
    saveProjection(local, p);
  }

  return { projection, onProjectionChange };
}
