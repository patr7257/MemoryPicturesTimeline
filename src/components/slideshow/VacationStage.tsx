"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ImageOff } from "lucide-react";

import { FADE_REDUCED_S, FADE_S } from "@/components/slideshow/transitions";
import { imgUrl } from "@/lib/img-url";
import { gridLayout, vacationDates, type GridLayout, type VacationScreen } from "@/lib/slideshow";
import { cn } from "@/lib/utils";

// Grid cells per layout. Never more than 2 by 2, so a tile is never smaller
// than a quarter of the grid; three photos sit two on top and one centred
// below at the same tile size (a four column grid, two columns per tile).
const GRID: Record<GridLayout, string> = {
  single: "grid-cols-1 grid-rows-1",
  pair: "grid-cols-2 grid-rows-1",
  trio: "grid-cols-4 grid-rows-2",
  quad: "grid-cols-2 grid-rows-2",
};
const TILE: Record<GridLayout, (i: number) => string> = {
  single: () => "",
  pair: () => "",
  trio: (i) => (i === 2 ? "col-span-2 col-start-2" : "col-span-2"),
  quad: () => "",
};

// The vacation slideshow's stage: one screen per vacation (or part of one),
// fading into the next like the Simple style. Title, dates and place on top,
// a grid of at most four photos, the vacation's note in a paper box below.
// Photos are never cropped (object-contain over a blurred copy of the same
// photo, as in the Simple style), so faces are never cut.
export function VacationStage({
  screen,
  reducedMotion,
  onLoaded,
  onFailed,
}: {
  screen: VacationScreen;
  reducedMotion: boolean;
  // Every tile settled and at least one photo shows: the timer may start.
  onLoaded: (key: string) => void;
  // No photo of the screen could load: the player skips it.
  onFailed: (key: string) => void;
}) {
  const seconds = reducedMotion ? FADE_REDUCED_S : FADE_S;
  return (
    <AnimatePresence>
      <motion.div
        key={screen.key}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: seconds, ease: "easeInOut" }}
      >
        <Screen screen={screen} onLoaded={onLoaded} onFailed={onFailed} />
      </motion.div>
    </AnimatePresence>
  );
}

function Screen({
  screen,
  onLoaded,
  onFailed,
}: {
  screen: VacationScreen;
  onLoaded: (key: string) => void;
  onFailed: (key: string) => void;
}) {
  const [settled, setSettled] = useState<Record<string, "ok" | "failed">>({});
  const reported = useRef(false);
  const { vacation, photos, part, parts } = screen;
  const layout = gridLayout(photos.length);
  const place = vacation.locationName?.trim() || null;
  const note = vacation.note?.trim() || null;
  const dates = vacationDates(vacation.startDate, vacation.endDate);

  useEffect(() => {
    if (reported.current) return;
    const states = photos.map((p) => settled[p.id]);
    if (states.some((s) => s === undefined)) return;
    reported.current = true;
    if (states.some((s) => s === "ok")) onLoaded(screen.key);
    else onFailed(screen.key);
  }, [settled, photos, screen.key, onLoaded, onFailed]);

  const mark = (id: string, state: "ok" | "failed") =>
    setSettled((prev) => (prev[id] ? prev : { ...prev, [id]: state }));

  return (
    <div className="absolute inset-0 flex flex-col px-3 pt-[calc(3.75rem+env(safe-area-inset-top))] pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:px-8">
      <header className="mx-auto flex w-full max-w-6xl shrink-0 items-end justify-between gap-4 pb-3">
        <div className="min-w-0">
          <h2 className="truncate font-hand text-3xl leading-tight sm:text-4xl">{vacation.title}</h2>
          <p className="truncate text-sm text-white/75 sm:text-base">
            {dates}
            {place && (
              <>
                <span aria-hidden className="mx-2 text-white/40">
                  ·
                </span>
                {place}
              </>
            )}
          </p>
        </div>
        {parts > 1 && (
          <p className="shrink-0 text-sm text-white/60 tabular-nums">
            {part} of {parts}
          </p>
        )}
      </header>

      <div className={cn("mx-auto grid min-h-0 w-full max-w-6xl flex-1 gap-2 sm:gap-3", GRID[layout])}>
        {photos.map((p, i) => (
          <div
            key={p.id}
            className={cn("relative min-h-0 min-w-0 overflow-hidden rounded-md bg-white/5", TILE[layout](i))}
          >
            {settled[p.id] === "failed" ? (
              <div className="grid size-full place-items-center text-white/40">
                <ImageOff aria-hidden className="size-8" />
              </div>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgUrl(p.id, 400)}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 size-full scale-125 object-cover opacity-40 blur-2xl"
                  draggable={false}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgUrl(p.id, 1200)}
                  alt={p.caption ?? ""}
                  className="absolute inset-0 size-full object-contain"
                  draggable={false}
                  onLoad={() => mark(p.id, "ok")}
                  onError={() => mark(p.id, "failed")}
                />
              </>
            )}
          </div>
        ))}
      </div>

      {note && (
        <p className="mx-auto mt-3 line-clamp-3 w-full max-w-3xl shrink-0 rounded-lg bg-card px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-card-foreground sm:text-base">
          {note}
        </p>
      )}
    </div>
  );
}
