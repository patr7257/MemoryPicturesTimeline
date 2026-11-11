// The slide projector scene: a dark room, a screen on the wall, a layered light
// beam from the lens with drifting dust, a film-strip push between slides with a
// focus pull, a slow drift while a slide is held, and a small projector body with
// a carousel. Plain three.js, no React: ProjectorStage.tsx drives it. This module
// is only ever loaded through a dynamic import, so three.js stays out of the
// initial bundle of the slideshow pages.
//
// Colour: the photo shaders read the texture as raw sRGB bytes (texture colour
// space left at NoColorSpace) and write them back unchanged, so photos come out
// exactly as stored. Only the projector body uses three's lit materials.

import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";

import {
  averageColor,
  beamTint,
  cameraDistance,
  dustSeeds,
  easeInOut,
  framing,
  kenBurnsAt,
  kenBurnsFor,
  lerp,
  letterbox,
  pushLook,
  safeColor,
  slidePhase,
  type KenBurns,
  type Rect,
  type Rgb,
} from "@/lib/projector";

export type SlideSource = { id: string; width: number; height: number; url: string };

export type ProjectorHooks = {
  // The projector cannot continue (shader error, context never came back): the
  // player switches to the simple fade.
  onUnavailable: () => void;
};

export type ProjectorScene = {
  // Fetches the image and prepares its texture (cached). Rejects when the image
  // cannot be loaded.
  load: (src: SlideSource) => Promise<void>;
  // Brings a loaded slide on screen with a push in direction `dir` (+1 forward).
  // `pushMs` is the push inside the slot, `holdMs` the whole slot. False when
  // the slide is not loaded.
  show: (id: string, dir: 1 | -1, timing: { pushMs: number; holdMs: number }) => boolean;
  // Frozen drift while paused (the push and the dust keep going).
  setPlaying: (playing: boolean) => void;
  // Only these slides (plus the two on screen) keep a texture; the rest are disposed.
  retain: (ids: readonly string[]) => void;
  dispose: () => void;
};

type Slide = {
  id: string;
  texture: Texture;
  aspect: number;
  avg: Rgb;
  kb: KenBurns;
};

// World layout (the demo's): the screen hangs at S, the lens sits in front of
// it, low and to the right.
const SCREEN_CENTER = new Vector3(0, 0.7, -4);
const SCREEN_H = 2.6;
const LENS = new Vector3(0.45, -0.9, -1.3);
const FOV = 40;
const RESTORE_WAIT_MS = 2500;
const DRIFT_TAIL_MS = 800;
const AVG_SIZE = 16;

const NOISE =
  "float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}" +
  "float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);" +
  "return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}";

const SCREEN_VERT = "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}";

// The screen shows a film strip: slide A, a dark gap, slide B, moving left as
// uShift goes 0 to 1 (mirrored for the other direction). Each slide is
// letterboxed by its own rect (xy = min, zw = size, in screen uv), so a photo is
// contained, never stretched. Both slides are always sampled (no branching
// around texture reads) so mip selection stays correct. uBlur is the focus pull.
const SCREEN_FRAG = `uniform sampler2D tA,tB;
uniform float uShift,uBlur,uDim,uTime,uJ,uDir;
uniform vec3 uKA,uKB;
uniform vec4 uRA,uRB;
varying vec2 vUv;
const float G=.14;
vec3 one(sampler2D t,vec2 uv,vec4 r){
  vec2 p=(uv-r.xy)/r.zw;
  float inside=step(0.,p.x)*step(p.x,1.)*step(0.,p.y)*step(p.y,1.);
  return texture2D(t,clamp(p,0.,1.)).rgb*inside;
}
vec3 smp(sampler2D t,vec2 uv,vec3 k,vec4 r){
  uv=(uv-.5)/k.z+.5+k.xy;
  vec3 c=one(t,uv,r);
  if(uBlur>.0004){
    for(int i=0;i<10;i++){
      float a=float(i)*2.399;
      float rr=sqrt((float(i)+.5)/10.)*uBlur;
      c+=one(t,uv+vec2(cos(a)*.67,sin(a))*rr,r);
    }
    c/=11.;
  }
  return c;
}
void main(){
  float u=uDir>0.?vUv.x:1.-vUv.x;
  float x=u+uShift*(1.+G);
  float y=vUv.y+uJ;
  float ax=x;
  float bx=x-1.-G;
  if(uDir<0.){ax=1.-ax;bx=1.-bx;}
  vec3 ca=smp(tA,vec2(ax,y),uKA,uRA);
  vec3 cb=smp(tB,vec2(bx,y),uKB,uRB);
  float ma=1.-step(1.,x);
  float mb=step(1.+G,x);
  vec3 c=ca*ma+cb*mb;
  vec2 q=vUv-.5;
  float vig=1.-dot(q,q)*.45;
  float edge=smoothstep(0.,.012,vUv.x)*smoothstep(0.,.012,1.-vUv.x)*smoothstep(0.,.018,vUv.y)*smoothstep(0.,.018,1.-vUv.y);
  float fl=.985+.015*sin(uTime*31.)*sin(uTime*7.3);
  c=(c*.97+.025)*vig*fl*uDim;
  gl_FragColor=vec4(mix(vec3(.045,.036,.03),c,edge),1.);
}`;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image failed: ${url}`));
    img.src = url;
  });
}

function imageAverage(img: HTMLImageElement): Rgb {
  try {
    const c = document.createElement("canvas");
    c.width = AVG_SIZE;
    c.height = AVG_SIZE;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return { r: 0.5, g: 0.5, b: 0.5 };
    g.drawImage(img, 0, 0, AVG_SIZE, AVG_SIZE);
    return averageColor(g.getImageData(0, 0, AVG_SIZE, AVG_SIZE).data);
  } catch {
    return { r: 0.5, g: 0.5, b: 0.5 };
  }
}

function beamGeometry(sw: number, sh: number): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const f of [1, 0.66, 0.33]) {
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const a0 = [LENS.x + a[0] * 0.05 * f, LENS.y + a[1] * 0.035 * f, LENS.z];
      const b0 = [LENS.x + b[0] * 0.05 * f, LENS.y + b[1] * 0.035 * f, LENS.z];
      const a1 = [
        SCREEN_CENTER.x + a[0] * (sw / 2) * f,
        SCREEN_CENTER.y + a[1] * (sh / 2) * f,
        SCREEN_CENTER.z + 0.02,
      ];
      const b1 = [
        SCREEN_CENTER.x + b[0] * (sw / 2) * f,
        SCREEN_CENTER.y + b[1] * (sh / 2) * f,
        SCREEN_CENTER.z + 0.02,
      ];
      pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
      uv.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return g;
}

// Throws when WebGL is unavailable (the caller falls back to the simple fade).
export function createProjectorScene(host: HTMLElement, hooks: ProjectorHooks): ProjectorScene {
  const coarse =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const dprCap = coarse ? 1.5 : 2;

  const renderer = new WebGLRenderer({ antialias: !coarse, alpha: false, powerPreference: "high-performance" });
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%";
  host.appendChild(canvas);
  renderer.debug.onShaderError = () => hooks.onUnavailable();

  let disposed = false;
  let lost = false;
  let restoreTimer: ReturnType<typeof setTimeout> | null = null;

  const scene = new Scene();
  scene.background = new Color(0x0c0907);
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 60);

  // ---- screen
  const blackTex = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blackTex.needsUpdate = true;
  const screenMat = new ShaderMaterial({
    uniforms: {
      tA: { value: blackTex },
      tB: { value: blackTex },
      uShift: { value: 0 },
      uBlur: { value: 0 },
      uDim: { value: 1 },
      uTime: { value: 0 },
      uJ: { value: 0 },
      uDir: { value: 1 },
      uKA: { value: new Vector3(0, 0, 1) },
      uKB: { value: new Vector3(0, 0, 1) },
      uRA: { value: new Vector4(0, 0, 1, 1) },
      uRB: { value: new Vector4(0, 0, 1, 1) },
    },
    vertexShader: SCREEN_VERT,
    fragmentShader: SCREEN_FRAG,
  });
  const screen = new Mesh(new PlaneGeometry(1, 1), screenMat);
  screen.position.copy(SCREEN_CENTER);
  scene.add(screen);

  // ---- soft glow on the wall behind the screen, tinted by the slide
  const wallMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uC: { value: new Color(0, 0, 0) } },
    vertexShader: SCREEN_VERT,
    fragmentShader:
      "uniform vec3 uC;varying vec2 vUv;void main(){float a=(1.-smoothstep(0.,.5,length(vUv-.5)))*.5;gl_FragColor=vec4(uC*a,1.);}",
  });
  const wall = new Mesh(new PlaneGeometry(15, 10), wallMat);
  wall.position.set(SCREEN_CENTER.x, SCREEN_CENTER.y, SCREEN_CENTER.z - 0.05);
  scene.add(wall);

  // ---- beam
  const beamMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: { uC: { value: new Color(1, 0.95, 0.85) }, uI: { value: 1 }, uTime: { value: 0 } },
    vertexShader: SCREEN_VERT,
    fragmentShader:
      "uniform vec3 uC;uniform float uI,uTime;varying vec2 vUv;" +
      NOISE +
      "void main(){float e=sin(vUv.y*3.14159);float n=vnoise(vec2(vUv.x*5.-uTime*.07,vUv.y*6.+uTime*.03));" +
      "float a=(.13*pow(1.-vUv.x,1.6)+.008)*e*(.55+.7*n)*uI;gl_FragColor=vec4(uC*a,1.);}",
  });
  let beamAspect = -1;
  const beam = new Mesh(beamGeometry(1, 1), beamMat);
  beam.frustumCulled = false;
  scene.add(beam);

  // ---- dust
  const DUST = coarse ? 170 : 340;
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute("position", new BufferAttribute(new Float32Array(DUST * 3), 3));
  dustGeo.setAttribute("aS", new BufferAttribute(dustSeeds(DUST, 99), 4));
  const dustMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uL: { value: LENS },
      uS: { value: SCREEN_CENTER },
      uHalf: { value: new Vector2(1, SCREEN_H / 2) },
      uTime: { value: 0 },
      uPx: { value: 30 },
      uC: { value: new Color(1, 0.95, 0.85) },
      uI: { value: 1 },
    },
    vertexShader: `uniform vec3 uL,uS;uniform vec2 uHalf;uniform float uTime,uPx;attribute vec4 aS;varying float vA;
void main(){float u=fract(aS.x+uTime*.006*(aS.w-.5));
vec2 ab=vec2(aS.y+sin(uTime*.23*(.5+aS.w)+aS.x*40.)*.08,fract(aS.z*.5+.5-uTime*.007*(.4+aS.w))*2.-1.);
vec3 sp=uS+vec3(ab*uHalf,0.);vec3 p=mix(uL,sp,.06+u*.9);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
gl_PointSize=uPx*(.5+aS.w)/-mv.z;
vA=(.3+.7*(.5+.5*sin(uTime*(.7+aS.w)+aS.x*90.)))*(1.-u*.55)*(1.-smoothstep(.75,1.,max(abs(ab.x),abs(ab.y))));}`,
    fragmentShader:
      "uniform vec3 uC;uniform float uI;varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(0.,.5,d))*vA*uI*.6;gl_FragColor=vec4(uC*a,1.);}",
  });
  const dust = new Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  // ---- lights and the projector body
  const hemi = new HemisphereLight(0x6a5a4c, 0x1a120c, 1.7);
  scene.add(hemi);
  const lamp = new PointLight(0xffffff, 18, 16, 1.4);
  lamp.position.set(SCREEN_CENTER.x, SCREEN_CENTER.y, SCREEN_CENTER.z + 1.2);
  scene.add(lamp);
  const bodyMat = new MeshStandardMaterial({ color: new Color("#4b3f37"), roughness: 0.55, metalness: 0.25 });
  const darkMat = new MeshStandardMaterial({ color: new Color("#2b231e"), roughness: 0.5, metalness: 0.4 });
  const glassMat = new MeshBasicMaterial({ color: 0xfff2d6 });
  const tableMat = new MeshStandardMaterial({ color: new Color("#3a2a1f"), roughness: 0.8 });
  const projector = new Group();
  const body = new Mesh(new BoxGeometry(0.62, 0.34, 0.82), bodyMat);
  body.position.set(0, -0.1, -0.5);
  const barrel = new Mesh(new CylinderGeometry(0.075, 0.09, 0.2, 20), darkMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.08);
  const glass = new Mesh(new CircleGeometry(0.066, 20), glassMat);
  glass.position.set(0, 0, 0.021);
  const carousel = new Mesh(new CylinderGeometry(0.3, 0.3, 0.09, 12), darkMat);
  carousel.position.set(0, 0.13, -0.5);
  const hub = new Mesh(new CylinderGeometry(0.07, 0.07, 0.12, 12), bodyMat);
  hub.position.set(0, 0.13, -0.5);
  projector.add(body, barrel, glass, carousel, hub);
  projector.position.copy(LENS);
  projector.lookAt(SCREEN_CENTER);
  scene.add(projector);
  const table = new Mesh(new BoxGeometry(1.7, 0.06, 2), tableMat);
  table.position.set(LENS.x, LENS.y - 0.42, LENS.z + 0.75);
  scene.add(table);

  // ---- state
  const cache = new Map<string, Slide>();
  const pending = new Map<string, Promise<void>>();
  let keep = new Set<string>();
  let cur: Slide | null = null;
  let nxt: Slide | null = null;
  let tCur = 0;
  let tNxt = 0;
  let pushT = 0;
  let pushMs = 600;
  let holdMs = 5000;
  let playing = true;
  let carA = 0;
  let carB = 0;
  const tint = new Color(1, 1, 1);
  let layoutAspect = 1.5;
  let beamK = 1;
  let time = 0;

  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  function setRect(v: Vector4, r: Rect) {
    v.x = r.x;
    v.y = r.y;
    v.z = r.w;
    v.w = r.h;
  }

  function applyRects() {
    setRect(screenMat.uniforms.uRA.value, cur ? letterbox(cur.aspect, layoutAspect) : letterbox(1, 1));
    setRect(screenMat.uniforms.uRB.value, nxt ? letterbox(nxt.aspect, layoutAspect) : letterbox(1, 1));
  }

  function layout() {
    const w = Math.max(2, host.clientWidth);
    const h = Math.max(2, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(w, h, false);

    const f = framing(w, h);
    const aspect = w / h;
    const sh = SCREEN_H;
    const sw = sh * f.screenAspect;
    layoutAspect = f.screenAspect;
    beamK = f.beamK;
    screen.scale.set(sw, sh, 1);
    dustMat.uniforms.uHalf.value.set(sw / 2, sh / 2);
    dustMat.uniforms.uPx.value = h * 0.024 * renderer.getPixelRatio();
    if (Math.abs(beamAspect - f.screenAspect) > 0.001) {
      beamAspect = f.screenAspect;
      beam.geometry.dispose();
      beam.geometry = beamGeometry(sw, sh);
    }

    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const look = new Vector3(f.yaw > 0 ? 0.1 : 0, SCREEN_CENTER.y - f.lookDown, SCREEN_CENTER.z);
    const dist = cameraDistance({ screenW: sw, screenH: sh, offsetY: f.lookDown, aspect, fovDeg: FOV, fill: f.fill });
    camera.position.set(
      look.x + f.yaw * dist,
      look.y - (f.compact ? 0 : 0.008 * dist),
      look.z + Math.sqrt(1 - f.yaw * f.yaw) * dist,
    );
    camera.lookAt(look);
    applyRects();
    draw();
  }

  function draw() {
    if (disposed || lost) return;
    renderer.render(scene, camera);
  }

  function update(dtMs: number) {
    const dt = dtMs / 1000;
    time += dt;
    const u = screenMat.uniforms;
    u.uTime.value = time;
    beamMat.uniforms.uTime.value = time;
    dustMat.uniforms.uTime.value = time;

    if (playing) {
      tCur += dtMs;
      if (nxt) tNxt += dtMs;
    }

    let look = { shift: 0, blur: 0, dim: 1, jitter: 0 };
    let p = 1;
    if (nxt) {
      pushT += dtMs;
      const phase = slidePhase(pushT, pushMs);
      p = phase.p;
      look = pushLook(phase.p);
      carousel.rotation.y = lerp(carA, carB, easeInOut(Math.min(1, phase.p / 0.46)));
      if (!phase.pushing) {
        cur = nxt;
        nxt = null;
        tCur = tNxt;
        u.tA.value = cur.texture;
        u.uKA.value.copy(drift(cur, tCur));
        applyRects();
        look = { shift: 0, blur: 0, dim: 1, jitter: 0 };
        carA = carB;
        carousel.rotation.y = carB;
      }
    }

    const span = holdMs + DRIFT_TAIL_MS;
    if (cur) u.uKA.value.copy(drift(cur, tCur, span));
    if (nxt) u.uKB.value.copy(drift(nxt, tNxt, span));
    u.uShift.value = look.shift;
    u.uBlur.value = look.blur;
    u.uJ.value = look.jitter;
    u.uDim.value = look.dim;

    const target = safeColor((nxt && p > 0.25 ? nxt : cur)?.avg ?? { r: 0.5, g: 0.5, b: 0.5 });
    tint.lerp(new Color().setRGB(target.r, target.g, target.b), 1 - Math.exp(-5 * dt));
    const bt = beamTint({ r: tint.r, g: tint.g, b: tint.b });
    beamMat.uniforms.uC.value.setRGB(bt.r, bt.g, bt.b);
    dustMat.uniforms.uC.value.setRGB(bt.r, bt.g, bt.b);
    beamMat.uniforms.uI.value = look.dim * beamK;
    dustMat.uniforms.uI.value = (0.35 + 0.65 * look.dim) * (0.6 + 0.4 * beamK);
    wallMat.uniforms.uC.value.setRGB(tint.r * 0.2 * look.dim, tint.g * 0.2 * look.dim, tint.b * 0.2 * look.dim);
    lamp.color.setRGB(tint.r, tint.g, tint.b);
    lamp.intensity = 18 * look.dim;
  }

  const driftVec = new Vector3();
  function drift(slide: Slide, t: number, span = holdMs + DRIFT_TAIL_MS): Vector3 {
    const k = kenBurnsAt(slide.kb, t / span);
    return driftVec.set(k.x, k.y, k.z);
  }

  // ---- loop
  let raf = 0;
  let running = false;
  let last = 0;
  function frame(now: number) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(50, Math.max(0, now - last));
    last = now;
    update(dt);
    draw();
  }
  function syncRun() {
    const want = !disposed && !lost && !document.hidden;
    if (want && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!want && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  }

  const onVisibility = () => syncRun();
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    syncRun();
    restoreTimer = setTimeout(() => {
      if (lost && !disposed) hooks.onUnavailable();
    }, RESTORE_WAIT_MS);
  };
  const onRestored = () => {
    lost = false;
    if (restoreTimer) clearTimeout(restoreTimer);
    restoreTimer = null;
    applyRects();
    syncRun();
  };
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => layout()) : null;
  ro?.observe(host);
  if (!ro) window.addEventListener("resize", layout);

  layout();
  update(0);
  draw();
  syncRun();

  // ---- slides
  function disposeSlide(s: Slide) {
    s.texture.dispose();
    cache.delete(s.id);
  }

  function load(src: SlideSource): Promise<void> {
    if (cache.has(src.id)) return Promise.resolve();
    const inflight = pending.get(src.id);
    if (inflight) return inflight;
    const job = loadImage(src.url).then((img) => {
      pending.delete(src.id);
      if (disposed) return;
      const texture = new Texture(img);
      texture.anisotropy = maxAniso;
      texture.needsUpdate = true;
      const w = img.naturalWidth || src.width;
      const h = img.naturalHeight || src.height;
      cache.set(src.id, {
        id: src.id,
        texture,
        aspect: w > 0 && h > 0 ? w / h : src.width / Math.max(1, src.height),
        avg: imageAverage(img),
        kb: kenBurnsFor(src.id),
      });
    });
    job.catch(() => pending.delete(src.id));
    pending.set(src.id, job);
    return job;
  }

  function show(id: string, d: 1 | -1, timing: { pushMs: number; holdMs: number }): boolean {
    const slide = cache.get(id);
    if (!slide || disposed) return false;
    if (cur?.id === id && !nxt) return true;
    if (nxt) {
      // Quick taps: land the push in progress at once, then start the next.
      cur = nxt;
      nxt = null;
      tCur = tNxt;
      screenMat.uniforms.tA.value = cur.texture;
      carA = carB;
    }
    pushMs = timing.pushMs;
    holdMs = timing.holdMs;
    nxt = slide;
    tNxt = 0;
    pushT = 0;
    carB = carA + (d > 0 ? 1 : -1) * (Math.PI / 6);
    screenMat.uniforms.uDir.value = d;
    screenMat.uniforms.tB.value = slide.texture;
    applyRects();
    return true;
  }

  function retain(ids: readonly string[]) {
    keep = new Set(ids);
    for (const s of Array.from(cache.values())) {
      if (keep.has(s.id) || s === cur || s === nxt) continue;
      disposeSlide(s);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    running = false;
    cancelAnimationFrame(raf);
    if (restoreTimer) clearTimeout(restoreTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    ro?.disconnect();
    if (!ro) window.removeEventListener("resize", layout);
    for (const s of Array.from(cache.values())) disposeSlide(s);
    cache.clear();
    pending.clear();
    blackTex.dispose();
    scene.traverse((o) => {
      const m = o as Mesh | Points;
      m.geometry?.dispose?.();
      const mat = (m as Mesh).material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    renderer.renderLists.dispose();
    renderer.dispose();
    try {
      renderer.forceContextLoss();
    } catch {
      // Already gone.
    }
    canvas.remove();
  }

  return {
    load,
    show,
    setPlaying: (p) => {
      playing = p;
    },
    retain,
    dispose,
  };
}
