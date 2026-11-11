"use client";

// The globe of memories band at the top of /timeline: every visible vacation
// with a location as a pin, an arc from home to each. The canvas is
// decorative; the chip row beneath it reaches the same vacations with real
// buttons, and the polaroid label carries a real "Open" link.
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Camera, Eye, EyeOff, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatTripDates } from "@/lib/dates";
import { imgUrl } from "@/lib/img-url";
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

export function GlobeOfMemories({ trips }: { trips: GlobeInputTrip[] }) {
  const flight = useFlight();
  const labelRef = useRef<HTMLDivElement>(null);
  // "unknown" until the stored preference is read, so a hidden globe never loads three.js.
  const [pref, setPref] = useState<"unknown" | "shown" | "hidden">("unknown");
  const hidden = pref === "hidden";
  const [status, setStatus] = useState<Status>("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nearby, setNearby] = useState(0);
  const [interacted, setInteracted] = useState(false);

  // Remembered per device. Read after mount so server and first client render match.
  useEffect(() => {
    try {
      setPref(localStorage.getItem(STORAGE_KEY) === "1" ? "hidden" : "shown");
    } catch {
      // storage can be blocked
      setPref("shown");
    }
  }, []);

  const pins = useMemo(
    () => trips.filter((t): t is GlobeTrip => t.lat !== null && t.lng !== null),
    [trips],
  );
  const selected = pins.find((t) => t.id === selectedId) ?? null;

  function toggleHidden() {
    const next = !hidden;
    setPref(next ? "hidden" : "shown");
    if (next) {
      setSelectedId(null);
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
                paused={flight?.flying ?? false}
                labelRef={labelRef}
                onSelect={choose}
                onInteract={() => setInteracted(true)}
                onReady={() => setStatus("ready")}
                onUnavailable={() => setStatus("unavailable")}
              />
            )}
            {status === "ready" && !interacted && (
              <p className="pointer-events-none absolute top-2.5 left-2.5 rounded-full border border-border bg-card/90 px-3 py-1 text-xs font-semibold">
                Drag to spin, tap a pin
              </p>
            )}
            {/* Positioned every frame by the scene; empty and invisible until a pin is selected. */}
            <div
              ref={labelRef}
              className="pointer-events-none absolute top-0 left-0 w-40 opacity-0 transition-opacity duration-200"
            >
              {selected && (
                <div
                  role="group"
                  aria-label={selected.title}
                  className="-rotate-1 bg-card p-1.5 pb-2 text-center shadow-[0_4px_14px_var(--paper-shadow)]"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                    {selected.coverPhotoId && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imgUrl(selected.coverPhotoId, 400)}
                        alt=""
                        className="size-full object-cover"
                        draggable={false}
                      />
                    )}
                  </div>
                  <b className="font-hand mt-1 block truncate text-xl leading-tight">{selected.title}</b>
                  <span className="block text-xs text-muted-foreground">
                    {formatTripDates(selected.startDate, selected.endDate)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Camera className="size-3" aria-hidden />
                    {selected.photoCount} {selected.photoCount === 1 ? "photo" : "photos"}
                  </span>
                  {nearby > 0 && (
                    <span className="block text-xs text-primary">
                      {nearby} more here, tap the pin again
                    </span>
                  )}
                  <FlightLink
                    trip={selected}
                    className="mt-1 inline-flex min-h-11 w-full items-center justify-center bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-8"
                  >
                    Open
                  </FlightLink>
                </div>
              )}
            </div>
          </div>

          {/* The same vacations as real buttons, for keyboard and screen reader users. */}
          <ul
            aria-label="Vacations on the globe"
            className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden"
          >
            {pins.map((t) => {
              const active = t.id === selected?.id;
              return (
                <li key={t.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => choose(active ? null : t.id)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-8 sm:px-3",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
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
        </>
      )}
    </section>
  );
}
