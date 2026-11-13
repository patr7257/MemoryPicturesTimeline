// Where a vacation sits on the globe and the map: where its cover photo was
// taken. The cover is the chosen cover photo, else the first photo (the same
// rule the timeline uses). Derived on every read, so changing the cover moves
// the pin at once. When the cover has no location, the stored pin stays (set
// at upload from the first GPS-tagged photo).

export type PinPhoto = { id: string; lat: number | null; lng: number | null };
export type Pin = { lat: number | null; lng: number | null };

export function effectiveCover<P extends { id: string }>(
  coverPhotoId: string | null,
  photos: readonly P[],
): P | null {
  return photos.find((p) => p.id === coverPhotoId) ?? photos[0] ?? null;
}

export function hasLocation(p: { lat: number | null; lng: number | null }): boolean {
  return p.lat !== null && p.lng !== null;
}

export function tripPin(
  trip: { coverPhotoId: string | null; lat: number | null; lng: number | null },
  photos: readonly PinPhoto[],
): Pin {
  const cover = effectiveCover(trip.coverPhotoId, photos);
  if (cover && hasLocation(cover)) return { lat: cover.lat, lng: cover.lng };
  return { lat: trip.lat, lng: trip.lng };
}
