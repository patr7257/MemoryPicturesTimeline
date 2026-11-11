// Small browser probes shared by the globe and the flight. No three.js here:
// this file is safe to import from the initial bundle.

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

let cached: boolean | null = null;

// True when a WebGL2 context can be created. Probed once with a throwaway
// canvas whose context is released straight away (the globe and the flight
// are the only contexts that should stay alive).
export function webglAvailable(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    cached = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}

// A creation failure later on (blocklisted GPU, too many contexts) overrides
// the probe so the rest of the page stops trying.
export function markWebglUnavailable(): void {
  cached = false;
}
