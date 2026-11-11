"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "motion/react";
import {
  Info,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";

import { InfoStrip } from "@/components/slideshow/InfoStrip";
import { DRIFT_KEYFRAMES, TRANSITIONS } from "@/components/slideshow/transitions";
import { Button } from "@/components/ui/button";
import { imgUrl } from "@/lib/img-url";
import {
  stepIndex,
  tripCountOf,
  type SlideshowPhoto,
  type SlideshowSettings,
} from "@/lib/slideshow";

const CONTROLS_HIDE_MS = 3000;
const SWIPE_PX = 50;

const iconButton =
  "size-11 text-white hover:bg-white/15 hover:text-white focus-visible:ring-white/70 [&_svg:not([class*='size-'])]:size-5";

type WakeLockSentinelLike = { release: () => Promise<void> };

// Full-window dark stage. `photos` is already in the order to play (the
// launcher shuffles in its click handler). Owns timing, controls, keyboard,
// swipe, wake lock and fullscreen; the look of the change between two photos is
// delegated to a SlideTransition (see transitions.tsx).
export function SlideshowPlayer({
  photos,
  settings,
  onExit,
}: {
  photos: SlideshowPhoto[];
  settings: SlideshowSettings;
  onExit: () => void;
}) {
  const Transition = TRANSITIONS.fade;
  const reducedMotion = useReducedMotion() ?? false;
  const holdMs = settings.seconds * 1000;
  const showTripTitle = tripCountOf(photos) > 1;

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [playing, setPlaying] = useState(true);
  const [ended, setEnded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [controlsVisible, setControlsVisible] = useState(true);
  const [activity, setActivity] = useState(0);
  const [infoOn, setInfoOn] = useState(settings.showInfo);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const lastBump = useRef(0);
  const preloaded = useRef<HTMLImageElement | null>(null);

  const photo = photos[index];
  const loaded = loadedId === photo?.id;
  const running = playing && !ended && loaded;

  function go(dir: 1 | -1, alsoFailed?: string) {
    const skip = new Set<number>();
    photos.forEach((p, i) => {
      if (failed.has(p.id) || p.id === alsoFailed) skip.add(i);
    });
    const step = stepIndex(index, dir, photos.length, skip);
    if (alsoFailed) setFailed((prev) => new Set(prev).add(alsoFailed));
    if (step.kind === "end") {
      setEnded(true);
      return;
    }
    if (step.kind === "go") {
      setDirection(dir);
      setIndex(step.index);
      setElapsed(0);
    }
  }

  function replay() {
    setEnded(false);
    setIndex(0);
    setDirection(1);
    setElapsed(0);
    setPlaying(true);
  }

  function bump() {
    setControlsVisible(true);
    setActivity((n) => n + 1);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen is optional.
    }
  }

  function exit() {
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    } catch {
      // Ignore.
    }
    onExit();
  }

  // Hold timer: counts only while the photo is on screen, playing and the tab
  // is visible, so pause and a hidden tab freeze the countdown.
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      setElapsed((e) => e + delta);
    }, 100);
    return () => clearInterval(t);
  }, [running]);

  const advanceWhenDone = useEffectEvent(() => go(1));
  useEffect(() => {
    if (running && elapsed >= holdMs) advanceWhenDone();
  }, [running, elapsed, holdMs]);

  // Preload the next playable photo so the cross-fade never shows a blank.
  useEffect(() => {
    for (let i = index + 1; i < photos.length; i++) {
      const next = photos[i];
      if (failed.has(next.id)) continue;
      const img = new Image();
      img.onerror = () => setFailed((prev) => new Set(prev).add(next.id));
      img.src = imgUrl(next.id, 1200);
      preloaded.current = img;
      return () => {
        img.onerror = null;
      };
    }
  }, [index, photos, failed]);

  // Pause when the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Keep the screen awake while playing (best effort).
  useEffect(() => {
    if (!playing || ended) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const wl = (navigator as Navigator & {
          wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> };
        }).wakeLock;
        if (!wl || document.hidden) return;
        const s = await wl.request("screen");
        if (cancelled) void s.release().catch(() => {});
        else sentinel = s;
      } catch {
        // Not supported or denied: the show works without it.
      }
    };
    void acquire();
    const onVisible = () => {
      if (!document.hidden && !sentinel) void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [playing, ended]);

  // Fullscreen availability and state.
  useEffect(() => {
    const sync = () => {
      setCanFullscreen(!!document.fullscreenEnabled);
      setIsFullscreen(!!document.fullscreenElement);
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      try {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      } catch {
        // Ignore.
      }
    };
  }, []);

  // Lock page scroll behind the stage; focus the stage for keyboard use.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    stageRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Auto-hide the controls while playing.
  useEffect(() => {
    if (!playing || ended || !controlsVisible) return;
    const t = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
    return () => clearTimeout(t);
  }, [playing, ended, controlsVisible, activity]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const onControl = (e.target as HTMLElement | null)?.closest?.("button, input, [role=slider]");
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        exit();
        return;
      case " ":
        if (onControl) return;
        e.preventDefault();
        if (ended) replay();
        else setPlaying((p) => !p);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (!ended) go(1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (ended) {
          setEnded(false);
          setElapsed(0);
        } else go(-1);
        break;
      case "f":
      case "F":
        e.preventDefault();
        void toggleFullscreen();
        break;
      default:
        return;
    }
    bump();
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onPointerDown(e: ReactPointerEvent) {
    gesture.current = (e.target as HTMLElement).closest("button")
      ? null
      : { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: ReactPointerEvent) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || ended) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      go(dx < 0 ? 1 : -1);
    }
    bump();
  }
  function onPointerMove() {
    const now = performance.now();
    if (now - lastBump.current < 400) return;
    lastBump.current = now;
    bump();
  }

  if (typeof document === "undefined") return null;

  const remaining = Math.max(0, Math.ceil((holdMs - elapsed) / 1000));
  const progress = loaded ? Math.min(1, elapsed / holdMs) : 0;

  return createPortal(
    <div
      ref={stageRef}
      role="dialog"
      aria-modal="true"
      aria-label="Slideshow"
      tabIndex={-1}
      className={
        "fixed inset-0 z-[60] touch-none overflow-hidden overscroll-none bg-black text-white outline-none select-none" +
        (controlsVisible || !playing ? "" : " cursor-none")
      }
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerMove={onPointerMove}
      onPointerCancel={() => (gesture.current = null)}
    >
      <style>{DRIFT_KEYFRAMES}</style>

      {!ended && photo && (
        <>
          <Transition
            photo={photo}
            direction={direction}
            holdMs={holdMs}
            playing={running}
            reducedMotion={reducedMotion}
            onLoaded={setLoadedId}
            onFailed={(id) => id === photo.id && go(1, id)}
          />
          {infoOn && <InfoStrip photo={photo} showTripTitle={showTripTitle} lift={controlsVisible} />}
        </>
      )}

      {/* Time left on this photo. */}
      <div className="absolute inset-x-0 top-0 h-1 bg-white/15" aria-hidden>
        <div
          className="h-full origin-left bg-white/80"
          style={{ transform: `scaleX(${ended ? 1 : progress})` }}
        />
      </div>

      {/* Top bar. */}
      <div
        inert={!controlsVisible && !ended}
        className={
          "absolute inset-x-0 top-1 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-2 pt-[env(safe-area-inset-top)] pb-6 transition-opacity duration-300 " +
          (controlsVisible || ended ? "opacity-100" : "pointer-events-none opacity-0")
        }
      >
        <p className="px-2 text-sm tabular-nums" aria-live="off">
          {ended ? `${photos.length} photos` : `${index + 1} / ${photos.length}`}
          {!ended && (
            <span className="ml-2 text-white/70">{playing ? `${remaining}s` : "paused"}</span>
          )}
        </p>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className={iconButton}
            aria-label={infoOn ? "Hide dates and notes" : "Show dates and notes"}
            aria-pressed={infoOn}
            onClick={() => setInfoOn((v) => !v)}
          >
            <Info />
          </Button>
          {canFullscreen && (
            <Button
              variant="ghost"
              size="icon"
              className={iconButton}
              aria-label={isFullscreen ? "Leave fullscreen" : "Fullscreen"}
              onClick={() => void toggleFullscreen()}
            >
              {isFullscreen ? <Minimize /> : <Maximize />}
            </Button>
          )}
          <Button variant="ghost" size="icon" className={iconButton} aria-label="Exit slideshow" onClick={exit}>
            <X />
          </Button>
        </div>
      </div>

      {/* Bottom controls. */}
      {!ended && (
        <div
          inert={!controlsVisible}
          className={
            "absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] transition-opacity duration-300 " +
            (controlsVisible ? "opacity-100" : "pointer-events-none opacity-0")
          }
        >
          <Button
            variant="ghost"
            size="icon"
            className={iconButton}
            aria-label="Previous photo"
            onClick={() => go(-1)}
          >
            <SkipBack />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={iconButton + " size-12 rounded-full bg-white/15"}
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={iconButton}
            aria-label="Next photo"
            onClick={() => go(1)}
          >
            <SkipForward />
          </Button>
        </div>
      )}

      {/* Closing card: never loops silently. */}
      {ended && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 px-6 text-center">
          <div className="space-y-5">
            <p className="font-hand text-4xl">That was the last photo</p>
            <p className="text-sm text-white/70">
              {photos.length - failed.size} of {photos.length} photos shown
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button className="h-11 px-5 text-sm" autoFocus onClick={replay}>
                <RotateCcw data-icon="inline-start" /> Replay
              </Button>
              <Button variant="outline" className="h-11 px-5 text-sm text-foreground" onClick={exit}>
                Exit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
