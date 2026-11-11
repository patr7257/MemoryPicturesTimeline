// Shared three.js engine for the globe of memories and the flight overlay:
// the stylised paper globe, arcs, pins, textures, disposal and a render stage
// that pauses offscreen, in hidden tabs and across WebGL context loss.
// Everything importing this file must be loaded through next/dynamic or a
// dynamic import(): three.js never belongs to an initial bundle.
import * as THREE from "three";

import { clamp, latLngToVec, slerp, type Vec3 } from "@/lib/globe-math";
import { isCoarsePointer, markWebglUnavailable } from "./webgl";

// Physically based lights in current three need PI times the intensity the
// demo (three r128, legacy lights) used for the same look.
export const LIGHT = Math.PI;

export const COL = {
  ink: "#4a3b30",
  card: "#fdfbf6",
  primary: "#bb6b4a",
  tape: "#e8d096",
  skyTop: "#b7d7e8",
  skyBottom: "#f6f0e3",
};

export const sstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeBack = (t: number): number => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

// Small seeded generator (mulberry32). Never Math.random in scenes.
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function vec3(lat: number, lng: number, radius = 1): THREE.Vector3 {
  const v = latLngToVec(lat, lng);
  return new THREE.Vector3(v[0], v[1], v[2]).multiplyScalar(radius);
}

const tupleOf = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];

// Point on the arc between unit vectors a and b at t, lifted by h * sin(PI t).
export function arcPoint(
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  h: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const p = slerp(tupleOf(a), tupleOf(b), t);
  return out.set(p[0], p[1], p[2]).multiplyScalar(1.003 + h * Math.sin(Math.PI * t));
}

export function canvasTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function skyTexture(): THREE.CanvasTexture {
  const c = makeCanvas(4, 256);
  const g = c.getContext("2d")!;
  const s = g.createLinearGradient(0, 0, 0, 256);
  s.addColorStop(0, COL.skyTop);
  s.addColorStop(1, COL.skyBottom);
  g.fillStyle = s;
  g.fillRect(0, 0, 4, 256);
  return canvasTexture(c);
}

export function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = makeCanvas(128, 128);
  const g = c.getContext("2d")!;
  const s = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  s.addColorStop(0, inner);
  s.addColorStop(1, outer);
  g.fillStyle = s;
  g.fillRect(0, 0, 128, 128);
  return canvasTexture(c);
}

// Releases geometries, materials and every texture they hold.
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const obj = o as THREE.Mesh;
    obj.geometry?.dispose();
    const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
    for (const m of mats) {
      for (const key of Object.keys(m)) {
        const v = (m as unknown as Record<string, unknown>)[key];
        if (v instanceof THREE.Texture) v.dispose();
      }
      const uniforms = (m as THREE.ShaderMaterial).uniforms;
      if (uniforms) {
        for (const k of Object.keys(uniforms)) {
          const v = uniforms[k].value;
          if (v instanceof THREE.Texture) v.dispose();
        }
      }
      m.dispose();
    }
  });
}

const NOISE = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}`;

// The paper-look globe: a sphere shaded from the land mask (soft sea, sand
// land, outlines, thin graticule) plus a pale halo. Returns the group; the
// caller disposes it with disposeTree.
export function createGlobe(mask: HTMLCanvasElement, low: boolean): THREE.Group {
  const maskTex = canvasTexture(mask, false);
  maskTex.anisotropy = 4;
  const mat = new THREE.ShaderMaterial({
    uniforms: { tM: { value: maskTex } },
    vertexShader: `varying vec2 vUv;varying vec3 vN;
void main(){vUv=uv;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tM;varying vec2 vUv;varying vec3 vN;${NOISE}
void main(){
 float m=texture2D(tM,vUv).r;float fw=max(fwidth(m),.002);
 float land=smoothstep(.9-fw,.9+fw,m);
 float lat=abs(vUv.y-.5)*2.;
 vec3 sea=mix(vec3(.47,.68,.78),vec3(.74,.87,.88),smoothstep(0.,.85,m)*.9);
 vec3 ld=mix(vec3(.94,.88,.73),vec3(.80,.84,.66),smoothstep(.35,.65,vnoise(vUv*vec2(44.,22.)+3.)));
 ld=mix(ld,vec3(.97,.96,.93),smoothstep(.7,.84,lat));
 vec3 c=mix(sea,ld,land);
 float ol=1.-smoothstep(.6,1.7,abs(m-.9)/fw);c=mix(c,vec3(.56,.41,.31),ol*.7);
 vec2 gq=vUv*vec2(24.,12.);vec2 gd=abs(fract(gq-.5)-.5)/max(fwidth(gq),vec2(1e-5));
 float gl=1.-min(min(gd.x,gd.y),1.);c=mix(c,vec3(1.),gl*.17*(1.-land*.6));
 c*=.95+.09*(vnoise(vUv*vec2(360.,180.))*.5+vnoise(vUv*vec2(1440.,720.))*.5);
 vec3 n=normalize(vN);float dif=max(dot(n,normalize(vec3(-.4,.5,.75))),0.);
 c*=(.76+.32*dif)*mix(.78,1.,smoothstep(0.,.55,n.z));
 gl_FragColor=vec4(c,1.);
}`,
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1, low ? 56 : 96, low ? 36 : 64), mat));
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(1.09, 48, 32),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 vN;void main(){float a=pow(clamp(-normalize(vN).z/.42,0.,1.),1.7)*.6;gl_FragColor=vec4(.96,.985,1.,a);}`,
    }),
  );
  group.add(halo);
  return group;
}

// Dashed (or, with uF=1, glowing with a travelling pulse) arc material. uP is
// the drawn fraction along the arc, uT the pulse position, uD the dash count.
export function createTrailMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uP: { value: 0 },
      uT: { value: 0 },
      uC: { value: new THREE.Color(color) },
      uD: { value: 30 },
      uG: { value: 0.3 },
      uF: { value: 0 },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uP,uT,uD,uG,uF;uniform vec3 uC;varying vec2 vUv;
void main(){float on=step(vUv.x,uP);float dash=mix(step(fract(vUv.x*uD),.55),1.,uF);
 float pulse=uF*on*(1.-smoothstep(0.,.14,abs(fract(uT)-vUv.x)));
 float a=dash*mix(uG*(1.-uF),1.,on)*(1.-uF*.3)+pulse;
 gl_FragColor=vec4(mix(uC,vec3(1.,.93,.76),pulse*.85),clamp(a,0.,1.));}`,
  });
}

export function createArcTube(
  a: THREE.Vector3,
  b: THREE.Vector3,
  h: number,
  radius: number,
  mat: THREE.Material,
): THREE.Mesh {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) pts.push(arcPoint(a, b, i / 40, h));
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, radius, 6, false), mat);
}

export function createPin(p: THREE.Vector3, color: string, scale: number): THREE.Group {
  const g = new THREE.Group();
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 16, 12),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.45 }),
  );
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0026, 0.0012, 0.04, 6),
    new THREE.MeshStandardMaterial({ color: new THREE.Color("#6b5547") }),
  );
  head.position.y = 0.045;
  stem.position.y = 0.02;
  g.add(head, stem);
  g.position.copy(p);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
  g.scale.setScalar(scale);
  return g;
}

// Font stack for text drawn into canvases: the app's handwriting font when
// it resolves, else a script fallback. Canvas cannot read CSS variables.
export function handFont(): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--font-hand").trim();
    if (v) return v;
  } catch {
    // fall through
  }
  return '"Segoe Script", cursive';
}

export function createLabelSprite(text: string, scale: number, font: string): THREE.Sprite {
  const c = makeCanvas(320, 112);
  const g = c.getContext("2d")!;
  g.font = `700 58px ${font}`;
  const tw = Math.min(320 - 16, g.measureText(text).width + 48);
  const x = (320 - tw) / 2;
  const [y, w, h, r] = [14, tw, 84, 24];
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fillStyle = "rgba(253,251,246,.96)";
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = COL.primary;
  g.stroke();
  g.fillStyle = COL.ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 160, 58, 320 - 56);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: canvasTexture(c), depthWrite: false, transparent: true }),
  );
  sprite.center.set(0.5, 0);
  sprite.scale.set(0.2 * scale, 0.07 * scale, 1);
  return sprite;
}

export type Gpu = { renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement; low: boolean };

// Creates a canvas inside `host` plus a renderer for it. Returns null (and
// remembers it) when WebGL cannot be had. The canvas is created here, never
// reused: a canvas whose context was force-lost cannot get a fresh one.
export function createGpu(host: HTMLElement): Gpu | null {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%;outline:none";
  host.appendChild(canvas);
  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    const coarse = isCoarsePointer();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
    return { renderer, canvas, low: coarse || Math.min(screen.width, screen.height) < 700 };
  } catch {
    canvas.remove();
    markWebglUnavailable();
    return null;
  }
}

export type StageOptions = {
  gpu: Gpu;
  host: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  // Return true to keep animating when `continuous` is false.
  update: (dt: number, time: number) => boolean | void;
  onResize: (w: number, h: number) => void;
  continuous: boolean;
  // Offscreen pausing only makes sense for the in-page globe.
  watchVisibility: boolean;
};

export type Stage = {
  // Draw at least one more frame (and keep going while update returns true).
  request: () => void;
  setPaused: (paused: boolean) => void;
  setContinuous: (continuous: boolean) => void;
  size: () => { w: number; h: number };
  dispose: () => void;
};

export function createStage(opts: StageOptions): Stage {
  const { gpu, host, scene, camera, update, onResize, watchVisibility } = opts;
  const { renderer, canvas } = gpu;
  let continuous = opts.continuous;
  let raf = 0;
  let last = 0;
  let time = 0;
  let w = 2;
  let h = 2;
  let paused = false;
  let visible = true;
  let tabHidden = typeof document !== "undefined" && document.hidden;
  let lost = false;
  let disposed = false;

  const active = () => !paused && visible && !tabHidden && !lost && !disposed;

  const frame = (now: number) => {
    raf = 0;
    if (!active()) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    time += dt;
    const more = update(dt, time);
    renderer.render(scene, camera);
    if (continuous || more === true) raf = requestAnimationFrame(frame);
  };

  const request = () => {
    if (raf || !active()) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };

  const resize = () => {
    const r = host.getBoundingClientRect();
    const nw = Math.max(2, Math.round(r.width));
    const nh = Math.max(2, Math.round(r.height));
    if (nw === w && nh === h) return;
    w = nw;
    h = nh;
    renderer.setSize(w, h, false);
    onResize(w, h);
    request();
  };

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const io = watchVisibility
    ? new IntersectionObserver((entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) request();
      })
    : null;
  io?.observe(host);

  const onVisibility = () => {
    tabHidden = document.hidden;
    if (!tabHidden) request();
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  const onRestored = () => {
    lost = false;
    request();
  };
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  // Initial size without waiting for the first observer callback.
  w = 0;
  h = 0;
  resize();
  request();

  return {
    request,
    setPaused(p) {
      paused = p;
      if (!p) request();
    },
    setContinuous(c) {
      continuous = c;
      request();
    },
    size: () => ({ w, h }),
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      renderer.dispose();
      // Release the GPU context now; Strict Mode and the flight's on-demand
      // context both depend on it not lingering until garbage collection.
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
