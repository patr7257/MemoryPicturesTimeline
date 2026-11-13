"use client";

// Every photo with GPS at the spot it was taken, on a MapLibre map
// (OpenFreeMap tiles: free, no API key). Nearby photos merge into a stack
// with a count when zoomed out and split step by step when zooming in
// (src/lib/photo-clusters.ts). Tapping a stack zooms in to where it splits;
// a stack of photos taken at one exact spot opens a grid instead. Tapping a
// photo opens a popup with a link to its vacation.
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Map, Marker, Popup, type MapRef } from "react-map-gl/maplibre";

import "maplibre-gl/dist/maplibre-gl.css";

import { imgUrl } from "@/lib/img-url";
import {
  CLUSTER_MAX_ZOOM,
  createPhotoIndex,
  markersFor,
  photosInCluster,
  type MapPhoto,
} from "@/lib/photo-clusters";
import { rotationFor } from "@/lib/scrapbook";
import { formatPhotoDateTime } from "@/lib/trip-view";

type View = { bbox: [number, number, number, number]; zoom: number };
type Open =
  | { kind: "photo"; photo: MapPhoto }
  | { kind: "spot"; lat: number; lng: number; photos: MapPhoto[] }
  | null;

function viewOf(map: MapRef): View {
  const b = map.getBounds();
  let west = b.getWest();
  let east = b.getEast();
  // Zoomed out past one world width: ask for everything.
  if (east - west >= 360) {
    west = -180;
    east = 180;
  }
  return { bbox: [west, Math.max(-85, b.getSouth()), east, Math.min(85, b.getNorth())], zoom: map.getZoom() };
}

function photoLabel(p: MapPhoto): string {
  return [p.tripTitle, p.city, formatPhotoDateTime(p.takenAt)].filter(Boolean).join(", ");
}

export function PhotosMap({ photos }: { photos: MapPhoto[] }) {
  const mapRef = useRef<MapRef>(null);
  const [view, setView] = useState<View | null>(null);
  const [open, setOpen] = useState<Open>(null);

  const index = useMemo(() => createPhotoIndex(photos), [photos]);
  const markers = useMemo(() => (view ? markersFor(index, view.bbox, view.zoom) : []), [index, view]);

  const initialViewState = useMemo(() => {
    if (photos.length === 0) {
      // Denmark-ish default when nothing has coordinates yet.
      return { longitude: 10.2, latitude: 56.1, zoom: 4 };
    }
    const lngs = photos.map((p) => p.lng);
    const lats = photos.map((p) => p.lat);
    if (Math.max(...lngs) - Math.min(...lngs) < 0.01 && Math.max(...lats) - Math.min(...lats) < 0.01) {
      return { longitude: lngs[0], latitude: lats[0], zoom: 12 };
    }
    return {
      bounds: [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ] as [[number, number], [number, number]],
      fitBoundsOptions: { padding: 60, maxZoom: 12 },
    };
  }, [photos]);

  const sync = useCallback(() => {
    if (mapRef.current) setView(viewOf(mapRef.current));
  }, []);

  return (
    <div className="mx-auto h-[70dvh] max-w-5xl overflow-hidden rounded-lg border">
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        style={{ width: "100%", height: "100%" }}
        onLoad={sync}
        onMove={sync}
        onClick={() => setOpen(null)}
      >
        {markers.map((m) =>
          m.kind === "photo" ? (
            <Marker key={m.key} longitude={m.lng} latitude={m.lat} anchor="bottom">
              <button
                type="button"
                aria-label={photoLabel(m.photo)}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen({ kind: "photo", photo: m.photo });
                }}
                className="block cursor-pointer bg-card p-1 pb-2 shadow-md transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                style={{ rotate: `${rotationFor(m.photo.id, 6)}deg` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgUrl(m.photo.id, 400)}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="size-12 bg-muted object-cover"
                />
              </button>
            </Marker>
          ) : (
            <Marker key={m.key} longitude={m.lng} latitude={m.lat} anchor="bottom">
              <button
                type="button"
                aria-label={`${m.count} photos here. ${m.splittable ? "Zoom in" : "Show them"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (m.splittable) {
                    setOpen(null);
                    mapRef.current?.easeTo({
                      center: [m.lng, m.lat],
                      zoom: Math.min(m.expansionZoom, CLUSTER_MAX_ZOOM + 1),
                      duration: 500,
                    });
                  } else {
                    setOpen({ kind: "spot", lat: m.lat, lng: m.lng, photos: photosInCluster(index, m.clusterId) });
                  }
                }}
                className="relative block cursor-pointer transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {/* Two blank cards behind the top photo read as a stack. */}
                <span aria-hidden className="absolute inset-0 rotate-6 bg-card shadow-md" />
                <span aria-hidden className="absolute inset-0 -rotate-3 bg-card shadow-md" />
                <span
                  className="relative block bg-card p-1 pb-2 shadow-md"
                  style={{ rotate: `${rotationFor(m.key, 4)}deg` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgUrl(m.coverId, 400)}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="size-14 bg-muted object-cover"
                  />
                </span>
                <span className="absolute -top-2 -right-2 z-10 grid min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground shadow">
                  {m.count}
                </span>
              </button>
            </Marker>
          ),
        )}

        {open?.kind === "photo" && (
          <Popup
            longitude={open.photo.lng}
            latitude={open.photo.lat}
            anchor="top"
            onClose={() => setOpen(null)}
            closeButton={false}
            closeOnClick={false}
            maxWidth="240px"
          >
            <div className="flex flex-col gap-1 p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgUrl(open.photo.id, 400)}
                alt=""
                className="aspect-[4/3] w-full bg-muted object-cover"
              />
              <p className="font-hand text-xl leading-tight">{open.photo.tripTitle}</p>
              <p className="text-xs text-muted-foreground">
                {[formatPhotoDateTime(open.photo.takenAt), open.photo.city].filter(Boolean).join(" · ") ||
                  "Date unknown"}
              </p>
              <Link href={`/trips/${open.photo.tripId}`} className="text-sm text-primary underline">
                Open vacation
              </Link>
            </div>
          </Popup>
        )}

        {open?.kind === "spot" && (
          <Popup
            longitude={open.lng}
            latitude={open.lat}
            anchor="top"
            onClose={() => setOpen(null)}
            closeButton={false}
            closeOnClick={false}
            maxWidth="260px"
          >
            <div className="flex flex-col gap-1.5 p-1">
              <p className="text-xs text-muted-foreground">{open.photos.length} photos taken here</p>
              <ul className="grid max-h-60 grid-cols-3 gap-1 overflow-y-auto">
                {open.photos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-label={photoLabel(p)}
                      onClick={() => setOpen({ kind: "photo", photo: p })}
                      className="block w-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imgUrl(p.id, 400)}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full bg-muted object-cover"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
