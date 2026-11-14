"use client";

// The map inside the location picker: tap anywhere to drop the pin, or drag
// it. Imports MapLibre, so it is only ever reached through next/dynamic.
import { useEffect, useRef } from "react";
import { Map, Marker, type MapRef } from "react-map-gl/maplibre";

import "maplibre-gl/dist/maplibre-gl.css";

import type { LatLngPoint } from "@/lib/photo-location";

export type PickerMapProps = {
  start: { lat: number; lng: number; zoom: number };
  point: LatLngPoint | null;
  onPick: (point: LatLngPoint) => void;
  // Bumped when the pin is set from outside (a shortcut button), so the map follows it.
  focusKey: number;
};

export default function PickerMap({ start, point, onPick, focusKey }: PickerMapProps) {
  const mapRef = useRef<MapRef>(null);
  const latestPoint = useRef(point);
  useEffect(() => {
    latestPoint.current = point;
  });

  useEffect(() => {
    const p = latestPoint.current;
    if (focusKey === 0 || !p) return;
    mapRef.current?.easeTo({ center: [p.lng, p.lat], zoom: Math.max(mapRef.current.getZoom(), 14), duration: 600 });
  }, [focusKey]);

  return (
    <Map
      ref={mapRef}
      initialViewState={{ longitude: start.lng, latitude: start.lat, zoom: start.zoom }}
      mapStyle="https://tiles.openfreemap.org/styles/liberty"
      style={{ width: "100%", height: "100%" }}
      cursor="crosshair"
      onClick={(e) => onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
    >
      {point && (
        <Marker
          longitude={point.lng}
          latitude={point.lat}
          anchor="bottom"
          draggable
          onDragEnd={(e) => onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
        >
          <svg aria-hidden viewBox="0 0 24 32" className="h-9 w-7 drop-shadow-md">
            <path
              d="M12 0C5.4 0 0 5.2 0 11.7 0 20.5 12 32 12 32s12-11.5 12-20.3C24 5.2 18.6 0 12 0z"
              className="fill-primary"
            />
            <circle cx="12" cy="11.5" r="4.5" fill="white" />
          </svg>
        </Marker>
      )}
    </Map>
  );
}
