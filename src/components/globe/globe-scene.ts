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
import {
  arcWidthFactor,
  fanOffsets,
  glowOpacity,
  pinPixelTarget,
  pinWorldHeight,
  pxToWorld,
} from "@/lib/globe-pins";
import { isCoarsePointer } from "./webgl";
import {
  COL,
  LIGHT,
  PIN_ASPECT,
  PIN_TIP_V,
  createArcTube,
  createGlobe,
  createGpu,
  createStage,
  createTrailMaterial,
  disposeTree,
  easeBack,
  easeInOut,
  easeOut,
  glowTexture,
  lerp,
  pinTexture,
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
  // Where the pin's tip stands: the vacation's spot, fanned out a little when
  // several vacations share it.
  p: THREE.Vector3;
  pin: THREE.Sprite;
  glow: THREE.Sprite;
  mat: THREE.ShaderMaterial | null;
};

type View = { lon: number; lat: number; dist: number };

const INTRO_SECONDS = 3;
// Flight arc tube radius at the zoomed-out distance (globe radii).
const ARC_RADIUS = 0.0035;
// Size of the soft glow under a pin, in CSS pixels.
const GLOW_PX = 16;
// Pick reach around the middle of a pin, in CSS pixels. The drawn pin is
// small, so a finger gets a much larger invisible target.
const PICK_MOUSE_PX = 15;
const PICK_TOUCH_PX = 28;

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
  // Pins and glows are camera-facing sprites sharing one texture and one
  // material each: a pin's tip is the sprite's anchor, so it stands on its spot.
  const pinTex = pinTexture(COL.primary, COL.ink, COL.card);
  const homeTex = pinTexture(COL.ink, COL.card, COL.primary);
  const glowTex = glowTexture("rgba(255,205,120,.95)", "rgba(255,190,100,0)");
  const spriteMat = (map: THREE.Texture, opacity = 1) =>
    new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity });
  const pinMat = spriteMat(pinTex);
  const homeMat = spriteMat(homeTex);
  const glowMat = spriteMat(glowTex, 0.4);
  const homePin = new THREE.Sprite(homeMat);
  homePin.center.set(0.5, PIN_TIP_V);
  homePin.position.copy(home);
  homePin.renderOrder = 2;
  scene.add(homePin);
  const marks = new THREE.Group();
  scene.add(marks);

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
    // Only the arcs live here: the pin sprites share materials and textures
    // that are released once with the scene.
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
    marks.clear();
    const fan = fanOffsets(trips);
    items = trips.map((trip, order) => {
      const o = fan.get(trip.id);
      const p = vec3(clamp(trip.lat + (o?.dLat ?? 0), -89, 89), trip.lng + (o?.dLng ?? 0));
      const angle = home.angleTo(p);
      let mat: THREE.ShaderMaterial | null = null;
      if (angle >= 0.004) {
        mat = createTrailMaterial(COL.primary, true);
        mat.uniforms.uF.value = 1;
        routes!.add(createArcTube(home, p, arcHeight(angle), ARC_RADIUS, mat, true));
      }
      const pin = new THREE.Sprite(pinMat);
      pin.center.set(0.5, PIN_TIP_V);
      pin.position.copy(p);
      pin.renderOrder = 2;
      const glow = new THREE.Sprite(glowMat);
      glow.position.copy(p);
      glow.renderOrder = 1;
      marks.add(glow, pin);
      return { trip, order, p, pin, glow, mat };
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

      // Pins keep a small fixed size on screen: their world size follows the
      // camera distance (see globe-pins.ts). Arcs and glows thin out as well.
      const { h: canvasH } = stage.size();
      const pinH = pinWorldHeight(view.dist, canvasH);
      const glowW = pxToWorld(GLOW_PX, view.dist, canvasH);
      const arcK = arcWidthFactor(view.dist);
      glowMat.opacity = glowOpacity(view.dist, maxDist());
      homePin.scale.set(pinH * PIN_ASPECT * 1.1, pinH * 1.1, 1);
      const n = items.length;
      items.forEach((it, i) => {
        const stagger = n > 1 ? (i / (n - 1)) * 1.5 : 0;
        const pr = RM ? 1 : easeOut(clamp((intro * INTRO_SECONDS - 0.3 - stagger) / 0.9, 0, 1));
        if (it.mat) {
          it.mat.uniforms.uP.value = pr;
          it.mat.uniforms.uT.value = RM ? 0.5 : time * 0.22 + i * 0.37;
          it.mat.uniforms.uK.value = arcK;
        }
        const s = Math.max(0.001, RM ? 1 : easeBack(clamp((pr - 0.7) / 0.3, 0, 1)));
        const lit = it.trip.id === hl || it.trip.id === hovered;
        const k = s * (lit ? 1.3 : 1);
        it.pin.scale.set(pinH * PIN_ASPECT * k, pinH * k, 1);
        it.pin.renderOrder = lit || it.trip.id === sel ? 3 : 2;
        const pulse = RM ? 1 : 1 + 0.15 * Math.sin(time * 2.2 + i);
        const g = glowW * s * pulse * (it.trip.id === sel || lit ? 1.6 : 1);
        it.glow.scale.set(g, g, 1);
      });

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
    const radius = coarse ? PICK_TOUCH_PX : PICK_MOUSE_PX;
    // The pin stands up from its tip on screen: aim at its middle.
    const lift = pinPixelTarget(h) * 0.45;
    const hits: { it: Item; d: number }[] = [];
    for (const it of items) {
      if (it.p.dot(camera.position) < 1.03) continue;
      v.copy(it.p).project(camera);
      const d = Math.hypot((v.x * 0.5 + 0.5) * w - x, (-v.y * 0.5 + 0.5) * h - lift - y);
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
      scene.remove(marks, homePin);
      marks.clear();
      for (const m of [pinMat, homeMat, glowMat]) m.dispose();
      for (const t of [pinTex, homeTex, glowTex]) t.dispose();
      (scene.background as THREE.Texture | null)?.dispose();
      stage.dispose();
    },
  };
}
