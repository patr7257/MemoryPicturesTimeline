"use client";

// Every trip with coordinates as a mini-polaroid pin on a MapLibre map
// (OpenFreeMap tiles: free, no API key). Clicking a pin opens a popup with
// the trip details and a link into the album.
import { useMemo, useState } from "react";
import Link from "next/link";
import { Map, Marker, Popup } from "react-map-gl/maplibre";

import "maplibre-gl/dist/maplibre-gl.css";

import { formatTripDates } from "@/lib/dates";
import { imgUrl } from "@/lib/img-url";
import { rotationFor } from "@/lib/scrapbook";

export type MapTrip = {
  id: string;
  title: string;
  startDate: string;
  endDate: string | null;
  locationName: string | null;
  lat: number;
  lng: number;
  coverPhotoId: string | null;
  photoCount: number;
};

export function TripsMap({ trips }: { trips: MapTrip[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = trips.find((t) => t.id === openId) ?? null;

  const initialViewState = useMemo(() => {
    if (trips.length === 0) {
      // Denmark-ish default when nothing has coordinates yet.
      return { longitude: 10.2, latitude: 56.1, zoom: 4 };
    }
    if (trips.length === 1) {
      return { longitude: trips[0].lng, latitude: trips[0].lat, zoom: 6 };
    }
    const lngs = trips.map((t) => t.lng);
    const lats = trips.map((t) => t.lat);
    return {
      bounds: [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ] as [[number, number], [number, number]],
      fitBoundsOptions: { padding: 80, maxZoom: 10 },
    };
  }, [trips]);

  return (
    <div className="mx-auto h-[70dvh] max-w-5xl overflow-hidden rounded-lg border">
      <Map
        initialViewState={initialViewState}
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        style={{ width: "100%", height: "100%" }}
      >
        {trips.map((t) => (
          <Marker
            key={t.id}
            longitude={t.lng}
            latitude={t.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setOpenId(t.id);
            }}
          >
            <div
              className="cursor-pointer bg-card p-1 pb-2 shadow-md transition-transform hover:scale-110"
              style={{ rotate: `${rotationFor(t.id, 6)}deg` }}
            >
              {t.coverPhotoId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgUrl(t.coverPhotoId, 400)}
                  alt={t.title}
                  className="size-12 bg-muted object-cover"
                />
              ) : (
                <div className="font-hand flex size-12 items-center justify-center bg-muted text-lg">
                  {t.title.slice(0, 1)}
                </div>
              )}
            </div>
          </Marker>
        ))}

        {open && (
          <Popup
            longitude={open.lng}
            latitude={open.lat}
            anchor="top"
            onClose={() => setOpenId(null)}
            closeButton={false}
            maxWidth="260px"
          >
            <div className="p-1">
              <p className="font-hand text-xl leading-tight">{open.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatTripDates(open.startDate, open.endDate)}
                {open.locationName ? ` · ${open.locationName}` : ""}
              </p>
              <Link href={`/trips/${open.id}`} className="text-primary text-sm underline">
                Open album ({open.photoCount} photos)
              </Link>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
