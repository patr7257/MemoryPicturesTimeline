"use client";

// The globe of memories band at the top of /timeline: every visible vacation
// with a location as a pin, an arc from home to each. The canvas is
// decorative; the chip row beneath it (one line, scrolls sideways) reaches the
// same vacations with real buttons. Hovering a pin or a chip (or tapping one)
// shows the vacation's card docked on the right, beside the globe, with a real
// "Open" link; the hovered pin's chip is highlighted and scrolled into view.
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Camera, ChevronLeft, ChevronRight, Eye, EyeOff, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatTripDates } from "@/lib/dates";
import { imgUrl } from "@/lib/img-url";
import { useScrollEdges } from "@/lib/use-scroll-edges";
import { cn } from "@/lib/utils";
import { FlightLink, useFlight } from "./FlightProvider";
import type { GlobeTrip } from "./types";

// three.js lives behind this boundary: never in the page's initial bundle.
const GlobeCanvas = dynamic(() => import("./GlobeCanvas"), { ssr: false, loading: () => null });

const STORAGE_KEY = "memories:globe-hidden";

export type GlobeInputTrip = Omit<GlobeTrip, "lat" | "lng"> & {
  lat: number | null;
  lng: number | null;
};

type Status = "loading" | "ready" | "unavailable";

const STRIP_ARROW =
  "absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md [@media(hover:hover)]:flex";

export function GlobeOfMemories({ trips }: { trips: GlobeInputTrip[] }) {
  const flight = useFlight();
  const chipsRef = useRef<HTMLUListElement>(null);
  // "unknown" until the stored preference is read, so a hidden globe never loads three.js.
  const [pref, setPref] = useState<"unknown" | "shown" | "hidden">("unknown");
  const hidden = pref === "hidden";
  const [status, setStatus] = useState<Status>("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Last pin or chip under the mouse; cleared when the mouse leaves the area.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [nearby, setNearby] = useState(0);
  const [interacted, setInteracted] = useState(false);
  const [coarse, setCoarse] = useState(false);

  // Remembered per device. Read after mount so server and first client render match.
  useEffect(() => {
    try {
      setPref(localStorage.getItem(STORAGE_KEY) === "1" ? "hidden" : "shown");
    } catch {
      // storage can be blocked
      setPref("shown");
    }
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const pins = useMemo(
    () => trips.filter((t): t is GlobeTrip => t.lat !== null && t.lng !== null),
    [trips],
  );
  const selected = pins.find((t) => t.id === selectedId) ?? null;
  const shown = pins.find((t) => t.id === hoveredId) ?? selected;
  const { edges, page } = useScrollEdges(chipsRef, pins.length);

  // Keep the hovered vacation's chip in view, scrolling the strip only (never the page).
  useEffect(() => {
    const strip = chipsRef.current;
    if (!strip || !hoveredId) return;
    const chip = strip.querySelector<HTMLElement>(`[data-trip="${CSS.escape(hoveredId)}"]`);
    if (!chip) return;
    const left = chip.offsetLeft - strip.offsetLeft;
    const inView =
      left >= strip.scrollLeft && left + chip.offsetWidth <= strip.scrollLeft + strip.clientWidth;
    if (!inView) {
      strip.scrollTo({ left: left - (strip.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
    }
  }, [hoveredId]);

  function toggleHidden() {
    const next = !hidden;
    setPref(next ? "hidden" : "shown");
    if (next) {
      setSelectedId(null);
      setHoveredId(null);
      setStatus("loading");
    }
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // best effort
    }
  }

  function choose(id: string | null, near = 0) {
    setSelectedId(id);
    setNearby(near);
    if (id) setInteracted(true);
  }

  if (status === "unavailable") return null;

  return (
    <section aria-labelledby="globe-heading" className="mx-auto max-w-5xl px-4 pt-1 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="globe-heading" className="font-hand text-3xl leading-none">
          Globe of memories
        </h2>
        <Button
          type="button"
          variant="ghost"
          onClick={toggleHidden}
          aria-expanded={!hidden}
          className="h-11 px-3 text-sm md:h-8"
        >
          {hidden ? <Eye /> : <EyeOff />}
          {hidden ? "Show globe" : "Hide globe"}
        </Button>
      </div>

      {!hidden && pins.length === 0 && (
        <p className="mt-2 rounded-xl border border-dashed border-border bg-card/60 px-4 py-6 text-center text-sm text-muted-foreground">
          Vacations show up here once a photo with a location is added.
        </p>
      )}

      {!hidden && pins.length > 0 && (
        <>
          <div
            onMouseLeave={() => setHoveredId(null)}
            className={cn(
              // Height is reserved up front so the page does not jump when the chunk arrives.
              "relative mt-2 h-[320px] overflow-hidden rounded-xl border border-border shadow-[0_2px_10px_var(--paper-shadow)]",
              "bg-[linear-gradient(to_bottom,#b7d7e8,#f6f0e3)] sm:h-[46vh] sm:max-h-[520px] sm:min-h-[340px]",
            )}
          >
            {status === "loading" && (
              <div
                role="status"
                className="absolute inset-0 grid place-items-center text-sm font-semibold text-muted-foreground"
              >
                <span className="grid size-40 place-items-center rounded-full bg-card/50 text-center">
                  Loading the globe
                </span>
              </div>
            )}
            {pref === "shown" && (
              <GlobeCanvas
                trips={pins}
                selectedId={selected?.id ?? null}
                highlightId={hoveredId}
                paused={flight?.flying ?? false}
                onSelect={choose}
                onHover={(id) => {
                  // Leaving a pin keeps its card, so the mouse can reach "Open".
                  if (id) setHoveredId(id);
                }}
                onInteract={() => setInteracted(true)}
                onReady={() => setStatus("ready")}
                onUnavailable={() => setStatus("unavailable")}
              />
            )}
            {status === "ready" && !interacted && (
              <p className="pointer-events-none absolute top-2.5 left-2.5 rounded-full border border-border bg-card/90 px-3 py-1 text-xs font-semibold">
                {coarse ? "Drag to spin, pinch to zoom" : "Drag to spin, Ctrl + scroll to zoom"}
              </p>
            )}
            {/* Docked on the right, beside the globe, so it never sits on top of the pins. */}
            {shown && (
              <div className="absolute right-2.5 bottom-2.5 z-10 w-32 sm:top-1/2 sm:right-4 sm:bottom-auto sm:w-48 sm:-translate-y-1/2">
                <div
                  role="group"
                  aria-label={shown.title}
                  className="-rotate-1 bg-card p-1.5 pb-2 text-center shadow-[0_4px_14px_var(--paper-shadow)]"
                >
                  <div className="aspect-video w-full overflow-hidden bg-muted sm:aspect-[4/3]">
                    {shown.coverPhotoId && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={shown.coverPhotoId}
                        src={imgUrl(shown.coverPhotoId, 400)}
                        alt=""
                        className="size-full object-cover"
                        draggable={false}
                      />
                    )}
                  </div>
                  <b className="font-hand mt-1 block truncate text-xl leading-tight sm:text-2xl">
                    {shown.title}
                  </b>
                  <span className="block text-xs text-muted-foreground">
                    {formatTripDates(shown.startDate, shown.endDate)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Camera className="size-3" aria-hidden />
                    {shown.photoCount} {shown.photoCount === 1 ? "photo" : "photos"}
                  </span>
                  {nearby > 0 && shown.id === selected?.id && (
                    <span className="block text-xs text-primary">
                      {nearby} more here, tap the pin again
                    </span>
                  )}
                  <FlightLink
                    trip={shown}
                    className="mt-1 inline-flex min-h-11 w-full items-center justify-center bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-8"
                  >
                    Open
                  </FlightLink>
                </div>
              </div>
            )}
          </div>

          {/* The same vacations as real buttons, for keyboard and screen reader users.
              Always one line: it scrolls sideways, with arrows for mouse users. */}
          <div className="relative mt-2" onMouseLeave={() => setHoveredId(null)}>
            <ul
              ref={chipsRef}
              aria-label="Vacations on the globe"
              className="flex gap-2 overflow-x-auto overscroll-x-contain py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {pins.map((t) => {
                const active = t.id === selected?.id;
                const lit = t.id === hoveredId && !active;
                return (
                  <li key={t.id} className="shrink-0">
                    <button
                      type="button"
                      data-trip={t.id}
                      aria-pressed={active}
                      onClick={() => choose(active ? null : t.id)}
                      onMouseEnter={() => setHoveredId(t.id)}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-8 sm:px-3",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : lit
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <MapPin className="size-3.5" aria-hidden />
                      {t.title}
                    </button>
                  </li>
                );
              })}
            </ul>
            {/* Mouse convenience only: keyboard users tab through the chips, touch swipes. */}
            {edges.start && (
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                onClick={() => page(-1)}
                className={`${STRIP_ARROW} left-0`}
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            {edges.end && (
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                onClick={() => page(1)}
                className={`${STRIP_ARROW} right-0`}
              >
                <ChevronRight className="size-5" />
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
