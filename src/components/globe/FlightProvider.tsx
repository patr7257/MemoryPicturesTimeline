"use client";

// Owns the "flight to the destination" transition. Wrap a page in
// <FlightProvider> and open vacations with <FlightLink>: a plain click plays
// the flight and lands on /trips/[id]; everything else (modified clicks,
// vacations without coordinates, reduced motion, no WebGL, a slow chunk)
// behaves as an ordinary link. Three.js is only reached through the lazy
// overlay, never from this file.
import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { flightEligible } from "@/lib/globe-math";
import { raiseVeil } from "./flight-veil";
import { loadLandMask } from "./land";
import type { FlightTarget } from "./types";
import { prefersReducedMotion, webglAvailable } from "./webgl";

// Do not make anyone wait for a download to watch an animation.
const LOAD_BUDGET_MS = 400;
const IDLE_PRELOAD_MS = 2500;

type OverlayModule = typeof import("./FlightOverlay");
let overlayModule: Promise<OverlayModule> | null = null;
let overlayLoaded = false;

function loadOverlayModule(): Promise<OverlayModule> {
  if (!overlayModule) {
    overlayModule = import("./FlightOverlay").catch((err) => {
      overlayModule = null;
      throw err;
    });
  }
  return overlayModule;
}

// Fetches the three.js chunk and the land data. Safe to call repeatedly.
export function preloadFlight(): Promise<void> {
  return Promise.all([loadOverlayModule(), loadLandMask()]).then(() => {
    overlayLoaded = true;
  });
}

const LazyOverlay = lazy(loadOverlayModule);

type TripHref = `/trips/${string}`;

type FlightApi = {
  // True while the overlay is mounted (the page's own globe pauses).
  flying: boolean;
  // Starts a flight to `href`. Returns true when it took over the navigation
  // (the caller must preventDefault), false when it declined (plain link).
  start: (target: FlightTarget, href: TripHref) => boolean;
  preload: () => void;
};

const FlightContext = createContext<FlightApi | null>(null);

// Null outside a FlightProvider: callers then navigate normally.
export function useFlight(): FlightApi | null {
  return useContext(FlightContext);
}

export function FlightProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [flight, setFlight] = useState<{ target: FlightTarget; href: TripHref } | null>(null);
  const busy = useRef(false);
  const navigated = useRef(false);

  // Warm the chunk once the page is idle so the first click already has it.
  useEffect(() => {
    if (prefersReducedMotion() || !webglAvailable()) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    const id = window.setTimeout(() => void preloadFlight().catch(() => {}), IDLE_PRELOAD_MS);
    return () => window.clearTimeout(id);
  }, []);

  const preload = useCallback(() => {
    if (prefersReducedMotion() || !webglAvailable()) return;
    void preloadFlight().catch(() => {});
  }, []);

  const start = useCallback(
    (target: FlightTarget, href: TripHref): boolean => {
      if (busy.current) return true; // a flight is already on its way
      if (prefersReducedMotion() || !flightEligible(target.lat, target.lng)) return false;
      busy.current = true;
      navigated.current = false;
      // The page is fetched while the plane flies.
      router.prefetch(href);
      const go = (ok: boolean) => {
        if (!ok || !webglAvailable()) {
          busy.current = false;
          router.push(href);
          return;
        }
        setFlight({ target, href });
      };
      if (overlayLoaded) go(true);
      else {
        void Promise.race([
          preloadFlight().then(
            () => true,
            () => false,
          ),
          new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), LOAD_BUDGET_MS)),
        ]).then(go);
      }
      return true;
    },
    [router],
  );

  const api = useMemo<FlightApi>(
    () => ({ flying: flight !== null, start, preload }),
    [flight, start, preload],
  );

  return (
    <FlightContext.Provider value={api}>
      {children}
      {flight &&
        createPortal(
          <Suspense fallback={null}>
            <LazyOverlay
              target={flight.target}
              onNavigate={() => {
                if (navigated.current) return;
                navigated.current = true;
                // Veil first: it must be on screen before this page unmounts.
                raiseVeil(flight.href);
                router.push(flight.href);
                busy.current = false;
                setFlight(null);
              }}
              onFail={() => {
                if (navigated.current) return;
                navigated.current = true;
                busy.current = false;
                setFlight(null);
                router.push(flight.href);
              }}
            />
          </Suspense>,
          document.body,
        )}
    </FlightContext.Provider>
  );
}

type FlightLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  trip: { id: string; title: string; lat: number | null; lng: number | null };
};

// A real link to /trips/[id]. A plain primary click plays the flight when a
// FlightProvider is above and the vacation has coordinates; Ctrl, Cmd, Shift,
// Alt and middle clicks, and "open in new tab" from the keyboard or context
// menu, stay ordinary link behaviour.
export function FlightLink({ trip, onClick, onPointerEnter, onFocus, ...rest }: FlightLinkProps) {
  const flight = useFlight();
  const href = `/trips/${trip.id}` as const;
  return (
    <Link
      href={href}
      {...rest}
      onPointerEnter={(e) => {
        onPointerEnter?.(e);
        flight?.preload();
      }}
      onFocus={(e) => {
        onFocus?.(e);
        flight?.preload();
      }}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !flight) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (rest.target && rest.target !== "_self") return;
        if (trip.lat === null || trip.lng === null) return;
        const target: FlightTarget = { id: trip.id, title: trip.title, lat: trip.lat, lng: trip.lng };
        if (flight.start(target, href)) e.preventDefault();
      }}
    />
  );
}
