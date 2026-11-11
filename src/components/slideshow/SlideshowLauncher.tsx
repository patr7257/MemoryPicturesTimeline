"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Minus, Play, Plus } from "lucide-react";

import { SlideshowPlayer } from "@/components/slideshow/SlideshowPlayer";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_SETTINGS,
  MAX_SECONDS,
  MIN_SECONDS,
  SETTINGS_STORAGE_KEY,
  clampSeconds,
  parseSettings,
  shuffle,
  summaryLabel,
  tripCountOf,
  type SlideshowOrder,
  type SlideshowPhoto,
  type SlideshowSettings,
  type SlideshowStyle,
} from "@/lib/slideshow";
import { cn } from "@/lib/utils";

// The setup screen plus the player. `photos` must already be in time order
// (getSlideshowPhotos returns them that way); this component only shuffles.
export function SlideshowLauncher({ photos }: { photos: SlideshowPhoto[] }) {
  const [settings, setSettings] = useState<SlideshowSettings>(DEFAULT_SETTINGS);
  const [queue, setQueue] = useState<SlideshowPhoto[] | null>(null);
  const [playedSettings, setPlayedSettings] = useState<SlideshowSettings>(DEFAULT_SETTINGS);
  const startRef = useRef<HTMLButtonElement>(null);
  const scrollY = useRef(0);

  // Saved choices are read after mount so server and first client render match.
  useEffect(() => {
    try {
      const saved = parseSettings(localStorage.getItem(SETTINGS_STORAGE_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSettings(saved);
    } catch {
      // Storage unavailable: defaults are fine.
    }
  }, []);

  function update(patch: Partial<SlideshowSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best effort.
    }
  }

  function start() {
    scrollY.current = window.scrollY;
    let order = photos;
    if (settings.order === "shuffle") {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      order = shuffle(photos, seed);
    }
    setPlayedSettings(settings);
    setQueue(order);
    // Must run inside this click to count as a user gesture; optional.
    try {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {
      // Fullscreen is optional.
    }
  }

  function exit() {
    setQueue(null);
    // The setup screen is back after this render: restore scroll and focus.
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY.current });
      startRef.current?.focus({ preventScroll: true });
    });
  }

  if (photos.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-8 text-center">
        <h2 className="font-hand text-3xl">No photos to show yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Photos from the vacations you can see will play here once they are uploaded.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button nativeButton={false} className="h-11 px-5 text-sm" render={<Link href="/upload" />}>
            Upload photos
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            className="h-11 px-5 text-sm"
            render={<Link href="/vacations" />}
          >
            Back to vacations
          </Button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="space-y-7 rounded-xl border border-border bg-card p-5 sm:p-7">
        <h2 className="font-hand text-3xl">Set up your slideshow</h2>

        <Choice
          legend="Style"
          name="slideshow-style"
          value={settings.style}
          onChange={(style: SlideshowStyle) => update({ style })}
          options={[
            { value: "projector", label: "Projector", hint: "A dark room, a slide projector" },
            { value: "simple", label: "Simple", hint: "Plain fade between photos" },
          ]}
        />

        <Choice
          legend="Order"
          name="slideshow-order"
          value={settings.order}
          onChange={(order: SlideshowOrder) => update({ order })}
          options={[
            { value: "time", label: "By time", hint: "Oldest vacation first" },
            { value: "shuffle", label: "Shuffled", hint: "A fresh mix every time" },
          ]}
        />

        <Choice
          legend="What to show"
          name="slideshow-info"
          value={settings.showInfo ? "info" : "photos"}
          onChange={(v: "info" | "photos") => update({ showInfo: v === "info" })}
          options={[
            { value: "info", label: "Dates and notes", hint: "Date, place, captions, comments" },
            { value: "photos", label: "Photos only", hint: "Nothing on top of the picture" },
          ]}
        />

        <fieldset>
          <legend className="text-sm font-medium">Seconds per photo</legend>
          <div className="mt-2 flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="One second less"
              disabled={settings.seconds <= MIN_SECONDS}
              onClick={() => update({ seconds: clampSeconds(settings.seconds - 1) })}
            >
              <Minus />
            </Button>
            <div className="min-w-0 flex-1 py-3">
              <Slider
                aria-label="Seconds per photo"
                min={MIN_SECONDS}
                max={MAX_SECONDS}
                step={1}
                value={[settings.seconds]}
                onValueChange={(v) => update({ seconds: clampSeconds(Array.isArray(v) ? v[0] : v) })}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="One second more"
              disabled={settings.seconds >= MAX_SECONDS}
              onClick={() => update({ seconds: clampSeconds(settings.seconds + 1) })}
            >
              <Plus />
            </Button>
            <output className="w-12 shrink-0 text-right text-sm tabular-nums" aria-live="polite">
              {settings.seconds} s
            </output>
          </div>
        </fieldset>

        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {summaryLabel(photos.length, tripCountOf(photos), settings.seconds)}
          </p>
          <Button ref={startRef} className="h-14 w-full gap-2 text-base" onClick={start}>
            <Play /> Start slideshow
          </Button>
        </div>
      </section>

      {queue && <SlideshowPlayer photos={queue} settings={playedSettings} onExit={exit} />}
    </>
  );
}

type Option<V extends string> = { value: V; label: string; hint: string };

// Two big radio cards. Native radios keep arrow-key and screen reader
// behaviour for free.
function Choice<V extends string>({
  legend,
  name,
  value,
  onChange,
  options,
}: {
  legend: string;
  name: string;
  value: V;
  onChange: (v: V) => void;
  options: Option<V>[];
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-14 cursor-pointer flex-col justify-center rounded-lg border px-4 py-2 transition-colors",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60",
              value === o.value
                ? "border-primary bg-primary/10"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="text-sm font-medium">{o.label}</span>
            <span className="text-xs text-muted-foreground">{o.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
