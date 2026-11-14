// Pure helpers for setting a photo's location by hand: input validation, the
// "same place as a nearby photo" shortcut, and where the picker map opens.
import type { Validated } from "@/lib/trip-view";

export type LatLngPoint = { lat: number; lng: number };

type Locatable = { id: string; takenAt: Date | null; lat: number | null; lng: number | null };

// Where the picker opens when nothing better is known: Denmark.
export const PICKER_FALLBACK = { lat: 56.1, lng: 10.2, zoom: 5 } as const;

export function validateLatLng(lat: unknown, lng: unknown): Validated<LatLngPoint> {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Pick a spot on the map" };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, error: "That spot is off the map" };
  }
  return { ok: true, value: { lat, lng } };
}

const located = (p: Locatable): p is Locatable & LatLngPoint => p.lat !== null && p.lng !== null;

// The other photo with a location taken closest in time to this one. Photos
// without a date rank after dated ones; when this photo has no date, the
// closest in list order (the album's order) wins. Ties go to the earlier one.
export function nearestLocated<P extends Locatable>(photos: readonly P[], photoId: string): P | null {
  const i = photos.findIndex((p) => p.id === photoId);
  if (i < 0) return null;
  const target = photos[i];
  let best: { p: P; rank: number; dist: number; at: number } | null = null;
  photos.forEach((p, at) => {
    if (p.id === photoId || !located(p)) return;
    let rank: number;
    let dist: number;
    if (target.takenAt && p.takenAt) {
      rank = 0;
      dist = Math.abs(p.takenAt.getTime() - target.takenAt.getTime());
    } else {
      rank = target.takenAt ? 1 : 0;
      dist = Math.abs(at - i);
    }
    if (!best || rank < best.rank || (rank === best.rank && (dist < best.dist || (dist === best.dist && at < best.at)))) {
      best = { p, rank, dist, at };
    }
  });
  return best ? (best as { p: P }).p : null;
}

// Where the picker map opens: the photo's own spot, else the nearby photo's,
// else the vacation's pin, else Denmark. Closer zoom for a more exact start.
export function pickerStart(
  photo: { lat: number | null; lng: number | null },
  nearby: LatLngPoint | null,
  tripPin: { lat: number | null; lng: number | null } | null,
): { lat: number; lng: number; zoom: number } {
  if (photo.lat !== null && photo.lng !== null) return { lat: photo.lat, lng: photo.lng, zoom: 15 };
  if (nearby) return { lat: nearby.lat, lng: nearby.lng, zoom: 14 };
  if (tripPin && tripPin.lat !== null && tripPin.lng !== null) return { lat: tripPin.lat, lng: tripPin.lng, zoom: 11 };
  return { ...PICKER_FALLBACK };
}
