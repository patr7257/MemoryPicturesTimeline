// The interactive globe of memories: drag with inertia, idle spin, arcs from
// home growing in with a travelling pulse, tap a pin to fly the camera to it,
// zoom (buttons, pinch, Ctrl + wheel), and mouse hover over pins.
// Framework-free so the React wrapper stays small; imports three, so it must
// only ever be reached through a dynamic import.
import * as THREE from "three";

import {
  HOME,
  angularDistance,
  arcHeight,
  clamp,
  initialView,
  latLngToVec,
  lngDelta,
  viewDistanceFor,
  wheelZoomFactor,
  zoomDistance,
} from "@/lib/globe-math";
import { isCoarsePointer } from "./webgl";
import {
  COL,
  LIGHT,
  createArcTube,
  createGlobe,
  createGpu,
  createPin,
  createStage,
  createTrailMaterial,
  disposeTree,
  easeBack,
  easeInOut,
  easeOut,
  glowTexture,
  lerp,
  skyTexture,
  sstep,
  vec3,
} from "./engine";
import type { GlobeTrip } from "./types";

export type GlobeSceneOptions = {
  host: HTMLElement;
  mask: HTMLCanvasElement;
  reducedMotion: boolean;
  // A tap on a pin (or empty space, id null). `nearby` counts other pins under the finger.
  onSelect: (id: string | null, nearby: number) => void;
  // The pin under the mouse, or null. Mouse only: touch has no hover.
  onHover: (id: string | null) => void;
  onInteract: () => void;
};

export type GlobeScene = {
  setTrips: (trips: GlobeTrip[]) => void;
  select: (id: string | null) => void;
  // Enlarges one pin (e.g. while its chip is hovered); null for none.
  highlight: (id: string | null) => void;
  // Below 1 zooms in, above 1 zooms out.
  zoomBy: (factor: number) => void;
  setPaused: (paused: boolean) => void;
  dispose: () => void;
};

type Item = {
  trip: GlobeTrip;
  order: number;
  p: THREE.Vector3;
  head: THREE.Vector3;
  pin: THREE.Group;
  glow: THREE.Sprite;
  mat: THREE.ShaderMaterial | null;
};

type View = { lon: number; lat: number; dist: number };

const INTRO_SECONDS = 3;

export function createGlobeScene(opts: GlobeSceneOptions): GlobeScene | null {
  const { host, mask, reducedMotion: RM } = opts;
  const gpu = createGpu(host);
  if (!gpu) return null;
  const { canvas, low } = gpu;
  const coarse = isCoarsePointer();

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 30);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe6d5b8, 1.05 * LIGHT));
  const globe = createGlobe(mask, low);
  scene.add(globe);
  const home = vec3(HOME.lat, HOME.lng);
  const homePin = createPin(home, COL.ink, 1.15);
  scene.add(homePin);
  const glowTex = glowTexture("rgba(255,205,120,.95)", "rgba(255,190,100,0)");

  let routes: THREE.Group | null = null;
  let items: Item[] = [];
  let sel: string | null = null;
  let hl: string | null = null;
  let hovered: string | null = null;
  // Camera distance the user zoomed to; null follows the automatic framing.
  let zoomed: number | null = null;
  const maxDist = () => fit * 1.15;

  // View state: camera orbits the globe at (lon, lat, dist).
  const view: View = { lon: HOME.lng, lat: 38, dist: 3.4 };
  let fit = 3.3; // whole globe in frame for the current size
  let rest = 3.3; // resting distance for the current pin spread
  let vLon = 0;
  let vLat = 0;
  let dragging = false;
  let idle = 0;
  let intro = RM ? 1 : 0;
  let fly: { a: View; b: View; t: number } | null = null;
  let lx = 0;
  let ly = 0;
  let lt = 0;
  let downX = 0;
  let downY = 0;
  let downAt = 0;
  let moved = 0;
  const v = new THREE.Vector3();

  const camVec = (lat: number, lng: number, d: number) => vec3(lat, lng, d);

  function disposeRoutes() {
    if (!routes) return;
    // The glow texture is shared by every sprite: detach it before the tree
    // is disposed, it is released once with the scene.
    routes.traverse((o) => {
      if ((o as THREE.Sprite).isSprite) (o as THREE.Sprite).material.map = null;
    });
    disposeTree(routes);
    scene.remove(routes);
    routes = null;
  }

  function computeRest(list: GlobeTrip[]) {
    let maxAngle = 0;
    const centre = latLngToVec(view.lat, view.lon);
    for (const p of [{ lat: HOME.lat, lng: HOME.lng }, ...list]) {
      maxAngle = Math.max(maxAngle, angularDistance(centre, latLngToVec(p.lat, p.lng)));
    }
    rest = Math.min(fit, viewDistanceFor(maxAngle));
  }

  function flyTo(to: View) {
    if (RM) {
      Object.assign(view, to);
      stage.request();
      return;
    }
    fly = { a: { ...view }, b: { lon: view.lon + lngDelta(view.lon, to.lon), lat: to.lat, dist: to.dist }, t: 0 };
    vLon = vLat = 0;
    stage.request();
  }

  function frameAll(list: GlobeTrip[], animate: boolean) {
    const target = initialView(list);
    const lat = clamp(target.lat, -60, 60);
    // computeRest measures from the target centre, not the current view.
    const saved = { lon: view.lon, lat: view.lat };
    view.lon = target.lng;
    view.lat = lat;
    computeRest(list);
    view.lon = saved.lon;
    view.lat = saved.lat;
    const to = { lon: target.lng, lat, dist: rest };
    if (animate) flyTo(to);
    else {
      Object.assign(view, to);
      stage.request();
    }
  }

  function setTrips(trips: GlobeTrip[]) {
    disposeRoutes();
    routes = new THREE.Group();
    scene.add(routes);
    items = trips.map((trip, order) => {
      const p = vec3(trip.lat, trip.lng);
      const angle = home.angleTo(p);
      let mat: THREE.ShaderMaterial | null = null;
      if (angle >= 0.004) {
        mat = createTrailMaterial(COL.primary);
        mat.uniforms.uF.value = 1;
        routes!.add(createArcTube(home, p, arcHeight(angle), 0.0045, mat));
      }
      const pin = createPin(p, COL.primary, 1.2);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }));
      glow.position.copy(p).multiplyScalar(1.054);
      routes!.add(pin, glow);
      return { trip, order, p, head: p.clone().multiplyScalar(1.06), pin, glow, mat };
    });
    if (sel && !items.some((i) => i.trip.id === sel)) sel = null;
    intro = RM ? 1 : 0;
    idle = 0;
    frameAll(trips, !firstTrips);
    firstTrips = false;
    stage.request();
  }
  let firstTrips = true;

  function select(id: string | null) {
    if (id === sel) return;
    sel = id;
    idle = 0;
    const it = id ? items.find((i) => i.trip.id === id) : undefined;
    if (!it) {
      stage.request();
      return;
    }
    flyTo({
      lon: it.trip.lng,
      lat: clamp(it.trip.lat + 7, -75, 75),
      dist: zoomed ?? Math.max(1.5, 1 + (fit - 1) * 0.55),
    });
  }

  function highlight(id: string | null) {
    if (id === hl) return;
    hl = id;
    stage.request();
  }

  function zoomBy(factor: number) {
    zoomed = zoomDistance(zoomed ?? view.dist, factor, maxDist());
    if (fly) fly.b.dist = zoomed;
    idle = 0;
    opts.onInteract();
    stage.request();
  }

  const stage = createStage({
    gpu,
    host,
    scene,
    camera,
    continuous: !RM,
    watchVisibility: true,
    onResize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fit = 1.12 / Math.sin(Math.atan(Math.tan((20 * Math.PI) / 180) * Math.min(1, w / h)));
      if (zoomed !== null) zoomed = zoomDistance(zoomed, 1, maxDist());
      if (items.length > 0 || sel === null) {
        computeRest(items.map((i) => i.trip));
        if (sel === null && !fly && zoomed === null) view.dist = rest;
      }
    },
    update(dt, time) {
      if (intro < 1) intro = Math.min(1, intro + dt / INTRO_SECONDS);
      const n = items.length;
      items.forEach((it, i) => {
        const stagger = n > 1 ? (i / (n - 1)) * 1.5 : 0;
        const pr = RM ? 1 : easeOut(clamp((intro * INTRO_SECONDS - 0.3 - stagger) / 0.9, 0, 1));
        if (it.mat) {
          it.mat.uniforms.uP.value = pr;
          it.mat.uniforms.uT.value = RM ? 0.5 : time * 0.22 + i * 0.37;
        }
        const s = Math.max(0.001, RM ? 1 : easeBack(clamp((pr - 0.7) / 0.3, 0, 1)));
        const lit = it.trip.id === hl || it.trip.id === hovered;
        it.pin.scale.setScalar(1.2 * s * (lit ? 1.35 : 1));
        const pulse = RM ? 1 : 1 + 0.2 * Math.sin(time * 2.2 + i);
        it.glow.scale.setScalar(0.09 * s * pulse * (it.trip.id === sel || lit ? 1.6 : 1));
      });

      // Where the camera distance settles: the user's zoom, else the framing.
      const goal = zoomed ?? (sel === null ? rest : null);
      if (fly) {
        fly.t = Math.min(1, fly.t + dt / 1.3);
        const e = easeInOut(fly.t);
        view.lon = lerp(fly.a.lon, fly.b.lon, e);
        view.lat = lerp(fly.a.lat, fly.b.lat, e);
        view.dist = lerp(fly.a.dist, fly.b.dist, e) + Math.sin(Math.PI * e) * 0.4;
        if (fly.t >= 1) fly = null;
      } else {
        if (!dragging) {
          view.lon += vLon * dt;
          view.lat = clamp(view.lat + vLat * dt, -80, 80);
          const k = Math.exp(-3 * dt);
          vLon *= k;
          vLat *= k;
          idle += dt;
          if (sel === null && idle > 2.5 && !RM) view.lon += dt * 4 * sstep(2.5, 4, idle);
        }
        if (goal !== null) {
          const rate = zoomed !== null ? 9 : 2.4;
          view.dist += (goal - view.dist) * (RM ? 1 : 1 - Math.exp(-rate * dt));
        }
      }
      camera.position.copy(camVec(view.lat, view.lon, view.dist));
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);

      return (
        fly !== null ||
        dragging ||
        Math.abs(vLon) > 0.05 ||
        Math.abs(vLat) > 0.05 ||
        intro < 1 ||
        (goal !== null && Math.abs(goal - view.dist) > 0.002)
      );
    },
  });

  // --- pointer input -------------------------------------------------------
  // Mouse: free drag in both axes. Touch: only horizontal drags spin the
  // globe (touch-action pan-y) so a vertical swipe scrolls the page instead
  // of trapping the user on the canvas.
  canvas.style.touchAction = coarse ? "pan-y" : "none";
  canvas.style.cursor = "grab";

  // Pins on the facing side within reach of (x, y), in canvas pixels.
  function hitsAt(x: number, y: number) {
    const { w, h } = stage.size();
    const radius = coarse ? 30 : 20;
    const hits: { it: Item; d: number }[] = [];
    for (const it of items) {
      if (it.p.dot(camera.position) < 1.03) continue;
      v.copy(it.head).project(camera);
      const d = Math.hypot((v.x * 0.5 + 0.5) * w - x, (-v.y * 0.5 + 0.5) * h - y);
      if (d < radius) hits.push({ it, d });
    }
    return hits;
  }

  function setHovered(id: string | null) {
    if (id === hovered) return;
    hovered = id;
    canvas.style.cursor = id ? "pointer" : "grab";
    opts.onHover(id);
    stage.request();
  }

  function hover(x: number, y: number) {
    const hits = hitsAt(x, y);
    const near = hits.length ? hits.reduce((best, hit) => (hit.d < best.d ? hit : best)).it : null;
    setHovered(near ? near.trip.id : null);
  }

  function tap(x: number, y: number) {
    const hits = hitsAt(x, y);
    if (hits.length === 0) {
      opts.onSelect(null, 0);
      return;
    }
    hits.sort((a, b) => a.it.order - b.it.order);
    const cur = hits.findIndex((hit) => hit.it.trip.id === sel);
    let pick: Item;
    if (cur >= 0) pick = hits[(cur + 1) % hits.length].it;
    else pick = hits.reduce((best, hit) => (hit.d < best.d ? hit : best)).it;
    opts.onSelect(pick.trip.id, hits.length - 1);
  }

  const rectOf = () => canvas.getBoundingClientRect();
  // Active pointers, for two-finger pinch zoom.
  const pts = new Map<number, { x: number; y: number }>();
  let pinch: number | null = null;
  const spread = () => {
    const [a, b] = Array.from(pts.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const r = rectOf();
    pts.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    if (pts.size === 2) {
      // Second finger: stop spinning, start pinching.
      dragging = false;
      vLon = vLat = 0;
      pinch = spread();
      return;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // capture is best effort
    }
    dragging = true;
    lx = downX = e.clientX - r.left;
    ly = downY = e.clientY - r.top;
    lt = downAt = performance.now();
    moved = 0;
    vLon = vLat = 0;
    fly = null;
    idle = 0;
    canvas.style.cursor = "grabbing";
    stage.request();
  };
  const onMove = (e: PointerEvent) => {
    const r = rectOf();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x, y });
    if (pinch !== null && pts.size >= 2) {
      const d = spread();
      if (pinch > 0 && d > 0) zoomBy(pinch / d);
      pinch = d;
      return;
    }
    if (!dragging) {
      if (e.pointerType === "mouse") hover(x, y);
      return;
    }
    const { h } = stage.size();
    const k = (41.7 * (view.dist - 1)) / h;
    const dx = x - lx;
    const dy = coarse ? 0 : y - ly;
    const now = performance.now();
    const dtm = Math.max(0.008, (now - lt) / 1000);
    view.lon -= dx * k;
    view.lat = clamp(view.lat + dy * k, -80, 80);
    vLon = lerp(vLon, (-dx * k) / dtm, 0.5);
    vLat = lerp(vLat, (dy * k) / dtm, 0.5);
    moved = Math.max(moved, Math.hypot(x - downX, y - downY));
    lx = x;
    ly = y;
    lt = now;
    idle = 0;
    stage.request();
  };
  const onUp = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pinch !== null) {
      // A pinch never ends in a tap or a spin.
      if (pts.size < 2) pinch = null;
      dragging = false;
      return;
    }
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = "grab";
    const now = performance.now();
    if (now - lt > 120) vLon = vLat = 0;
    if (moved < 6 && now - downAt < 600) {
      const r = rectOf();
      tap(e.clientX - r.left, e.clientY - r.top);
    } else if (moved >= 6) opts.onInteract();
    stage.request();
  };
  const onCancel = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    dragging = false;
    canvas.style.cursor = "grab";
    vLon = vLat = 0;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  const onLeave = () => setHovered(null);
  canvas.addEventListener("pointerleave", onLeave);
  // Plain wheel keeps scrolling the page; Ctrl + wheel (and a trackpad pinch,
  // which arrives as one) zooms the globe instead of the page.
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomBy(wheelZoomFactor(e.deltaY));
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return {
    setTrips,
    select,
    highlight,
    zoomBy,
    setPaused: (p) => stage.setPaused(p),
    dispose() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      disposeRoutes();
      disposeTree(globe);
      disposeTree(homePin);
      glowTex.dispose();
      (scene.background as THREE.Texture | null)?.dispose();
      stage.dispose();
    },
  };
}
