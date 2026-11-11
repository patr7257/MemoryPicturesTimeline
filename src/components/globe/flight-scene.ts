// The flight: a paper plane leaves the home pin, a dashed great-circle trail
// draws, a chase camera follows through a few clouds, descends on the
// destination and the view whites out. Imports three, so it must only be
// reached through a dynamic import.
import * as THREE from "three";

import { HOME, arcHeight, clamp, flightDuration } from "@/lib/globe-math";
import { hashCode } from "@/lib/scrapbook";
import {
  COL,
  LIGHT,
  arcPoint,
  canvasTexture,
  createArcTube,
  createGlobe,
  createGpu,
  createLabelSprite,
  createPin,
  createStage,
  createTrailMaterial,
  disposeTree,
  handFont,
  lerp,
  makeCanvas,
  seededRandom,
  skyTexture,
  sstep,
  vec3,
} from "./engine";
import type { FlightTarget } from "./types";

export type FlightSceneOptions = {
  host: HTMLElement;
  mask: HTMLCanvasElement;
  target: FlightTarget;
  // The white-out element; its opacity is driven here, every frame.
  flash: HTMLElement | null;
  // First frame drawn: the overlay can fade in.
  onReady: () => void;
  // The view is white: start (or hold) the navigation now.
  onNavigate: () => void;
};

export type FlightScene = {
  skip: () => void;
  dispose: () => void;
};

const WAIT_SECONDS = 0.35;
// Navigate while the white-out is (nearly) complete so the page is ready beneath.
const NAVIGATE_AT = 0.97;

export function createFlightScene(opts: FlightSceneOptions): FlightScene | null {
  const { host, mask, target, flash } = opts;
  const gpu = createGpu(host);
  if (!gpu) return null;
  const low = gpu.low;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  const cam = new THREE.PerspectiveCamera(40, 1, 0.004, 30);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe6d5b8, 0.95 * LIGHT));
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.45 * LIGHT);
  sun.position.set(-2, 3, 2);
  scene.add(sun);
  const globe = createGlobe(mask, low);
  scene.add(globe);

  const home = vec3(HOME.lat, HOME.lng);
  const dest = vec3(target.lat, target.lng);
  // A tiny angle would make a degenerate arc; the clamp keeps short hops sane.
  const ang = Math.max(0.01, home.angleTo(dest));
  const h = arcHeight(ang);
  const ps = 0.02 + 0.03 * ang; // plane scale
  const dur = flightDuration(ang);
  const mid = home.clone().add(dest).normalize();
  if (mid.lengthSq() < 0.5) mid.set(0, 1, 0);

  // Paper plane.
  const planeGeo = new THREE.BufferGeometry();
  planeGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, 1, 0, 0.06, -0.8, -0.62, 0.06, -0.8, 0, 0, 1, 0.62, 0.06, -0.8, 0, 0.06, -0.8, 0, 0, 1, 0, 0.06, -0.8, 0, -0.24, -0.72],
      3,
    ),
  );
  planeGeo.computeVertexNormals();
  const plane = new THREE.Mesh(
    planeGeo,
    new THREE.MeshStandardMaterial({
      color: new THREE.Color("#f3e9d6"),
      roughness: 0.85,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  );
  plane.add(new THREE.LineSegments(new THREE.EdgesGeometry(planeGeo, 1), new THREE.LineBasicMaterial({ color: new THREE.Color("#6b5547") })));
  scene.add(plane);

  // Route: trail, pins, labels, clouds. One group so it disposes in one go.
  const route = new THREE.Group();
  scene.add(route);
  const trailMat = createTrailMaterial(COL.primary);
  trailMat.uniforms.uD.value = Math.round(14 + ang * 40);
  const trail = createArcTube(home, dest, h, ps * 0.085, trailMat);
  route.add(trail);
  const pinScale = clamp(ps / 0.03, 0.7, 1.6);
  const pins = [createPin(home, COL.ink, pinScale), createPin(dest, COL.primary, pinScale)];
  route.add(...pins);
  const font = handFont();
  const labelScale = clamp(ang * 1.5, 0.62, 1.4);
  const title = target.title.length > 20 ? `${target.title.slice(0, 19)}.` : target.title;
  const labels = [createLabelSprite("Home", labelScale, font), createLabelSprite(title, labelScale, font)];
  labels[0].position.copy(home).multiplyScalar(1 + 0.055 * pinScale);
  labels[1].position.copy(dest).multiplyScalar(1 + 0.055 * pinScale);
  route.add(...labels);

  // Clouds, seeded from the vacation id so the same flight looks the same.
  const cc = makeCanvas(128, 128);
  const cg = cc.getContext("2d")!;
  const cr = seededRandom(5);
  for (let i = 0; i < 9; i++) {
    const x = 64 + (cr() - 0.5) * 56;
    const y = 68 + (cr() - 0.5) * 24;
    const q = 18 + cr() * 20;
    const s = cg.createRadialGradient(x, y, 0, x, y, q);
    s.addColorStop(0, "rgba(255,255,255,.9)");
    s.addColorStop(0.6, "rgba(255,252,246,.45)");
    s.addColorStop(1, "rgba(255,250,240,0)");
    cg.fillStyle = s;
    cg.fillRect(0, 0, 128, 128);
  }
  const cloudTex = canvasTexture(cc);
  type Cloud = { sprite: THREE.Sprite; opacity: number; drift: number; side: THREE.Vector3 };
  const clouds: Cloud[] = [];
  const rnd = seededRandom(hashCode(target.id) + 3);
  const cloudCount = low ? 18 : 28;
  for (let k = 0; k < cloudCount; k++) {
    const u = 0.16 + rnd() * 0.8;
    const p = arcPoint(home, dest, u, h);
    const nn = p.clone().normalize();
    const tg = arcPoint(home, dest, Math.min(1, u + 0.01), h).sub(p).normalize();
    const side = new THREE.Vector3().crossVectors(nn, tg);
    const near = k % 3 === 0;
    if (near && u < 0.55) p.addScaledVector(side, ps * 6);
    p.addScaledVector(nn, ps * (near ? 2 + rnd() * 2.6 : 1.5 + rnd() * 4)).addScaledVector(
      side,
      ps * (near ? (rnd() - 0.5) * 5 : (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 10)),
    );
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false }));
    sprite.position.copy(p);
    const q = ps * (3 + rnd() * 4.5);
    sprite.scale.set(q, q * 0.62, 1);
    route.add(sprite);
    clouds.push({ sprite, opacity: 0.55 + rnd() * 0.4, drift: (rnd() - 0.5) * 0.02, side });
  }

  // Scratch vectors.
  const P = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const N = new THREE.Vector3();
  const TG = new THREE.Vector3();
  const X = new THREE.Vector3();
  const Yv = new THREE.Vector3();
  const O = new THREE.Vector3();
  const Cc = new THREE.Vector3();
  const Lc = new THREE.Vector3();
  const E = new THREE.Vector3();
  const look = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);

  let t = 0;
  let wait = WAIT_SECONDS;
  let cloudK = 0;
  let navigated = false;
  let ready = false;

  function apply(tt: number) {
    const u = sstep(0.05, 0.9, tt);
    arcPoint(home, dest, u, h, P);
    arcPoint(home, dest, Math.max(0, u - 0.01), h, A);
    arcPoint(home, dest, Math.min(1, u + 0.01), h, B);
    TG.copy(B).sub(A);
    if (TG.lengthSq() < 1e-12) TG.copy(dest).sub(home);
    TG.normalize();
    N.copy(P).normalize();
    X.crossVectors(N, TG).normalize();
    Yv.crossVectors(TG, X);
    m4.makeBasis(X, Yv, TG);
    plane.quaternion.setFromRotationMatrix(m4);
    plane.rotateZ(Math.sin(u * Math.PI * 2) * 0.32);
    plane.position.copy(P).addScaledVector(N, ps * 0.3);
    plane.scale.setScalar(ps * (1 - 0.45 * sstep(0.88, 1, u)));
    trailMat.uniforms.uP.value = u;

    const Ro = (1 + clamp(ang * 2.1, 0.85, 1.9)) * (cam.aspect < 1 ? 1.22 : 1);
    O.copy(mid).addScaledVector(UP, 0.22).normalize().multiplyScalar(Ro);
    Cc.copy(P).addScaledVector(N, ps * 3.2).addScaledVector(TG, -ps * 8);
    Lc.copy(P).addScaledVector(TG, ps * 5);
    E.copy(P).addScaledVector(N, ps * 1.7).addScaledVector(TG, -ps * 3.6);
    const a = sstep(0.03, 0.36, tt);
    const b = sstep(0.7, 0.98, tt);
    cam.position.copy(O).lerp(Cc, a).lerp(E, b);
    // Never let the camera clip into the globe on a short hop.
    if (cam.position.length() < 1.012) cam.position.setLength(1.012);
    look.copy(mid).lerp(Lc, a).lerp(dest, b);
    cam.up.copy(UP).lerp(N, a).normalize();
    cam.lookAt(look);
    cloudK = a * (1 - 0.5 * b);
    for (const p of pins) p.scale.setScalar(pinScale * lerp(1, 0.3, a));
    for (const l of labels) l.material.opacity = 1 - sstep(0, 0.5, a);
    if (flash) flash.style.opacity = String(sstep(0.86, 0.99, tt));
  }

  function fireNavigate() {
    if (navigated) return;
    navigated = true;
    opts.onNavigate();
  }

  const stage = createStage({
    gpu,
    host,
    scene,
    camera: cam,
    continuous: true,
    watchVisibility: false,
    onResize(w, hh) {
      cam.aspect = w / hh;
      cam.updateProjectionMatrix();
      apply(t);
    },
    update(dt) {
      if (wait > 0) wait -= dt;
      else if (t < 1) {
        t = Math.min(1, t + dt / dur);
        apply(t);
        if (t >= NAVIGATE_AT) fireNavigate();
      }
      for (const c of clouds) {
        const dd = c.sprite.position.distanceTo(cam.position);
        c.sprite.position.addScaledVector(c.side, c.drift * ps * dt * 4);
        c.sprite.material.opacity = c.opacity * cloudK * sstep(ps * 1.5, ps * 7, dd);
      }
      if (!ready) {
        ready = true;
        opts.onReady();
      }
    },
  });
  apply(0);

  return {
    skip: fireNavigate,
    dispose() {
      scene.remove(route);
      disposeTree(route);
      disposeTree(plane);
      disposeTree(globe);
      (scene.background as THREE.Texture | null)?.dispose();
      stage.dispose();
    },
  };
}
