"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Minus, Play, Plus } from "lucide-react";

import { SlideshowPlayer } from "@/components/slideshow/SlideshowPlayer";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DEFAULT_SETTINGS,
  MAX_SECONDS,
  MIN_SECONDS,
  SETTINGS_STORAGE_KEY,
  buildVacationScreens,
  clampSeconds,
  parseSettings,
  shuffle,
  summaryLabel,
  tripCountOf,
  vacationSummaryLabel,
  type SlideshowKind,
  type SlideshowOrder,
  type SlideshowPhoto,
  type SlideshowSettings,
  type SlideshowStyle,
  type SlideshowVacation,
  type VacationScreen,
  type VacationShow,
} from "@/lib/slideshow";
import { cn } from "@/lib/utils";

const PHOTO_KIND_HINT = "One photo at a time, with its date, place and notes";
const VACATION_KIND_HINT =
  "Trip down memory lane of all your family's vacations in organised or randomized order";

// The setup screen plus the player. `photos` must already be in time order
// (getSlideshowPhotos returns them that way); this component only shuffles.
// With `vacations` (getSlideshowVacations) the launcher also offers the
// vacation slideshow; without it (a single vacation's page) it is a photo
// slideshow only.
export function SlideshowLauncher({
  photos,
  vacations,
}: {
  photos: SlideshowPhoto[];
  vacations?: SlideshowVacation[];
}) {
  const [settings, setSettings] = useState<SlideshowSettings>(DEFAULT_SETTINGS);
  const [queue, setQueue] = useState<SlideshowPhoto[] | null>(null);
  const [screenQueue, setScreenQueue] = useState<VacationScreen[] | null>(null);
  const isVacation = !!vacations && settings.kind === "vacation";
  // Counts only, so the order does not matter here.
  const plannedScreens = useMemo(
    () =>
      vacations
        ? buildVacationScreens(vacations, { show: settings.vacationShow, order: "time", seed: 0 })
        : [],
    [vacations, settings.vacationShow],
  );
  const plannedVacations = new Set(plannedScreens.map((s) => s.vacation.id)).size;
  const seconds = isVacation ? settings.screenSeconds : settings.seconds;
  const setSeconds = (value: number) =>
    isVacation
      ? update({ screenSeconds: clampSeconds(value, DEFAULT_SETTINGS.screenSeconds) })
      : update({ seconds: clampSeconds(value) });
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
    if (isVacation && vacations) {
      const seed = settings.order === "shuffle" ? crypto.getRandomValues(new Uint32Array(1))[0] : 0;
      setPlayedSettings(settings);
      setScreenQueue(
        buildVacationScreens(vacations, { show: settings.vacationShow, order: settings.order, seed }),
      );
    } else {
      let order = photos;
      if (settings.order === "shuffle") {
        const seed = crypto.getRandomValues(new Uint32Array(1))[0];
        order = shuffle(photos, seed);
      }
      setPlayedSettings(settings);
      setQueue(order);
    }
    // Must run inside this click to count as a user gesture; optional.
    try {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {
      // Fullscreen is optional.
    }
  }

  function exit() {
    setQueue(null);
    setScreenQueue(null);
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

        {vacations && (
          <Choice
            legend="Slideshow"
            name="slideshow-kind"
            value={settings.kind}
            onChange={(kind: SlideshowKind) => update({ kind })}
            explain
            options={[
              { value: "photo", label: "Photo slideshow", hint: PHOTO_KIND_HINT },
              { value: "vacation", label: "Vacation slideshow", hint: VACATION_KIND_HINT },
            ]}
          />
        )}

        {!isVacation && (
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
        )}

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

        {isVacation ? (
          <Choice
            legend="What to show"
            name="slideshow-vacation-show"
            value={settings.vacationShow}
            onChange={(vacationShow: VacationShow) => update({ vacationShow })}
            options={[
              { value: "selected", label: "Selected", hint: "Four photos from each vacation" },
              { value: "all", label: "All", hint: "Every photo, four at a time" },
            ]}
          />
        ) : (
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
        )}

        <fieldset>
          <legend className="text-sm font-medium">
            {isVacation ? "Seconds per screen" : "Seconds per photo"}
          </legend>
          <div className="mt-2 flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="One second less"
              disabled={seconds <= MIN_SECONDS}
              onClick={() => setSeconds(seconds - 1)}
            >
              <Minus />
            </Button>
            <div className="min-w-0 flex-1 py-3">
              <Slider
                aria-label={isVacation ? "Seconds per screen" : "Seconds per photo"}
                min={MIN_SECONDS}
                max={MAX_SECONDS}
                step={1}
                value={[seconds]}
                onValueChange={(v) => setSeconds(Array.isArray(v) ? v[0] : v)}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="One second more"
              disabled={seconds >= MAX_SECONDS}
              onClick={() => setSeconds(seconds + 1)}
            >
              <Plus />
            </Button>
            <output className="w-12 shrink-0 text-right text-sm tabular-nums" aria-live="polite">
              {seconds} s
            </output>
          </div>
        </fieldset>

        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {isVacation
              ? vacationSummaryLabel(plannedScreens.length, plannedVacations, settings.screenSeconds)
              : summaryLabel(photos.length, tripCountOf(photos), settings.seconds)}
          </p>
          <Button
            ref={startRef}
            className="h-14 w-full gap-2 text-base"
            disabled={isVacation && plannedScreens.length === 0}
            onClick={start}
          >
            <Play /> Start slideshow
          </Button>
        </div>
      </section>

      {queue && <SlideshowPlayer photos={queue} settings={playedSettings} onExit={exit} />}
      {screenQueue && <SlideshowPlayer screens={screenQueue} settings={playedSettings} onExit={exit} />}
    </>
  );
}

type Option<V extends string> = { value: V; label: string; hint: string };

// Two big radio cards. Native radios keep arrow-key and screen reader
// behaviour for free. With `explain`, each hint is the card's accessible
// description and shows as a tooltip on hover and keyboard focus; on touch
// screens (no hover) it stays visible on the card instead.
function Choice<V extends string>({
  legend,
  name,
  value,
  onChange,
  options,
  explain = false,
}: {
  legend: string;
  name: string;
  value: V;
  onChange: (v: V) => void;
  options: Option<V>[];
  explain?: boolean;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((o) =>
          explain ? (
            <ExplainedCard
              key={o.value}
              option={o}
              name={name}
              checked={value === o.value}
              onSelect={() => onChange(o.value)}
            />
          ) : (
            <label key={o.value} className={cardClass(value === o.value)}>
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
          ),
        )}
      </div>
    </fieldset>
  );
}

function cardClass(checked: boolean): string {
  return cn(
    "flex min-h-14 cursor-pointer flex-col justify-center rounded-lg border px-4 py-2 transition-colors",
    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60",
    checked ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted",
  );
}

// A radio card whose hint explains it: a tooltip after 300ms of hover and at
// once on keyboard focus (frontend-ui-patterns CMP-07, CMP-12), closed by
// pointer leave, blur, Escape or an outside tap (CMP-10). Touch has no hover,
// so on hover-less screens the hint is shown on the card itself. Either way it
// is the radio's accessible description.
function ExplainedCard<V extends string>({
  option,
  name,
  checked,
  onSelect,
}: {
  option: Option<V>;
  name: string;
  checked: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hintId = useId();
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        delay={300}
        render={<label className={cn(cardClass(checked), "group")} />}
      >
        <input
          type="radio"
          name={name}
          value={option.value}
          checked={checked}
          onChange={onSelect}
          aria-describedby={hintId}
          onFocus={(e) => {
            if (e.currentTarget.matches(":focus-visible")) setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          className="sr-only"
        />
        <span className="text-sm font-medium">{option.label}</span>
        <span
          id={hintId}
          className="text-xs text-muted-foreground [@media(hover:hover)]:sr-only"
        >
          {option.hint}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[300px]">{option.hint}</TooltipContent>
    </Tooltip>
  );
}
